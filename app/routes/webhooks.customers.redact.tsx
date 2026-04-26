import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR: Delete customer data within 30 days. Required by Shopify App Store.
// This template stores no per-customer data, so we acknowledge and log.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const customerId = (payload as { customer?: { id?: number | string } })
    .customer?.id;
  console.log(
    `Received ${topic} for shop=${shop} customer=${customerId ?? "unknown"}`,
  );
  // If your app stores customer-scoped data, delete or anonymize it here.
  return new Response();
};
