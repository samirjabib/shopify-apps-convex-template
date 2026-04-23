// convex/lib/auth.ts
import { ConvexError } from "convex/values";

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4;
  const b64 = (s + "===".slice(0, pad ? 4 - pad : 0))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function requireShopifyAuth(
  token: string,
): Promise<{ shop: string; userId?: string }> {
  const secret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!secret || !apiKey) throw new ConvexError("Server misconfigured");

  const parts = token.split(".");
  if (parts.length !== 3) throw new ConvexError("Malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!timingSafeEqual(new Uint8Array(signed), base64UrlDecode(sigB64))) {
    throw new ConvexError("Invalid token signature");
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadB64)),
  );
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new ConvexError("Token expired");
  if (payload.nbf > now) throw new ConvexError("Token not yet valid");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(apiKey)) throw new ConvexError("Wrong audience");
  if (!payload.dest) throw new ConvexError("Missing dest");
  if (!payload.iss || !payload.iss.endsWith("/admin")) {
    throw new ConvexError("Invalid issuer");
  }

  const shop = new URL(payload.dest).hostname;
  return { shop, userId: payload.sub };
}
