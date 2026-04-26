import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR: Customer requests data we have stored about them.
// Required by Shopify App Store. Respond within 30 days with relevant data.
// This template stores no per-customer data, so we acknowledge and log.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const customerId = (payload as { customer?: { id?: number | string } })
    .customer?.id;
  console.log(
    `Received ${topic} for shop=${shop} customer=${customerId ?? "unknown"}`,
  );
  // If your app stores customer-scoped data, gather it here and email the
  // shop owner (per Shopify guidelines) or persist a fulfillment record.
  return new Response();
};
