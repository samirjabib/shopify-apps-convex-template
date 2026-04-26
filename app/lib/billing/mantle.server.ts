// Mantle billing adapter. Server-only.
// Docs: https://heymantle.com/docs/integrate
import { MantleClient } from "@heymantle/client";

let cached: MantleClient | null = null;

export function getMantleClient(): MantleClient {
  if (cached) return cached;
  const appId = process.env.MANTLE_APP_ID;
  const apiKey = process.env.MANTLE_API_KEY;
  if (!appId || !apiKey) {
    throw new Error(
      "Mantle adapter requires MANTLE_APP_ID and MANTLE_API_KEY in env",
    );
  }
  cached = new MantleClient({ appId, apiKey });
  return cached;
}

// Called from afterAuth. Registers the shop with Mantle and returns the
// per-customer apiToken used by the React SDK.
export async function identifyShop(input: {
  shop: string;
  shopId: string;
  accessToken: string;
  name?: string;
  email?: string;
}): Promise<{ apiToken: string }> {
  const mantle = getMantleClient();
  const result = await mantle.identify({
    platform: "shopify",
    platformId: input.shopId,
    myshopifyDomain: input.shop,
    accessToken: input.accessToken,
    name: input.name,
    email: input.email,
  });
  if ("error" in result) {
    throw new Error(`Mantle identify failed: ${result.error}`);
  }
  return { apiToken: result.apiToken };
}
