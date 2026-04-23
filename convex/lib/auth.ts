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

const SHOP_HOST = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export async function requireShopifyAuth(
  token: string,
): Promise<{ shop: string; userId?: string }> {
  const secret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!secret || !apiKey) throw new ConvexError("Server misconfigured");

  const parts = token.split(".");
  if (parts.length !== 3) throw new ConvexError("Malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: unknown; typ?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  } catch {
    throw new ConvexError("Malformed token header");
  }
  if (header.typ !== "JWT") throw new ConvexError("Invalid token type");
  if (header.alg !== "HS256") throw new ConvexError("Unsupported algorithm");

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

  let payload: {
    exp?: unknown;
    nbf?: unknown;
    aud?: unknown;
    iss?: unknown;
    dest?: unknown;
    sub?: unknown;
  };
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    throw new ConvexError("Malformed token payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new ConvexError("Token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now) {
    throw new ConvexError("Token not yet valid");
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(apiKey)) throw new ConvexError("Wrong audience");

  if (typeof payload.dest !== "string" || typeof payload.iss !== "string") {
    throw new ConvexError("Missing dest or iss");
  }

  let destHost: string;
  let issHost: string;
  try {
    destHost = new URL(payload.dest).hostname;
    issHost = new URL(payload.iss).hostname;
  } catch {
    throw new ConvexError("Malformed dest or iss");
  }

  if (!SHOP_HOST.test(destHost)) throw new ConvexError("Invalid shop host");
  if (issHost !== destHost) throw new ConvexError("Issuer host mismatch");
  if (!payload.iss.endsWith("/admin")) {
    throw new ConvexError("Invalid issuer path");
  }

  return {
    shop: destHost,
    userId: typeof payload.sub === "string" ? payload.sub : undefined,
  };
}
