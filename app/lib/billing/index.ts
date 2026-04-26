// Billing facade. Swap providers via BILLING_PROVIDER env var without
// touching call sites.
//   BILLING_PROVIDER=none    → no-op (default; template ships unbilled)
//   BILLING_PROVIDER=mantle  → @heymantle/client integration

import * as mantle from "./mantle.server";

export type BillingProvider = "none" | "mantle";

export function getBillingProvider(): BillingProvider {
  const raw = process.env.BILLING_PROVIDER ?? "none";
  if (raw === "mantle") return "mantle";
  return "none";
}

export interface ShopIdentity {
  shop: string;
  shopId: string;
  accessToken: string;
  name?: string;
  email?: string;
}

// Returns the per-shop billing apiToken (or null when disabled).
// Call this after Shopify OAuth so the customer is registered with the
// billing provider before the dashboard loads.
export async function identifyShop(
  input: ShopIdentity,
): Promise<{ apiToken: string } | null> {
  const provider = getBillingProvider();
  if (provider === "none") return null;
  return mantle.identifyShop(input);
}
