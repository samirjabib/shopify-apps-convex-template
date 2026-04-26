// Billing — opt-in pricing/subscription page.
// Reads the per-shop Mantle apiToken from Convex (written by afterAuth)
// and mounts <MantleProvider> so children can call useMantle() to fetch
// plans, subscribe, send usage events, etc.
import { MantleProvider, useMantle } from "@heymantle/react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { internal } from "../../convex/_generated/api";
import { runQuery } from "../convex.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const provider = process.env.BILLING_PROVIDER ?? "none";
  if (provider !== "mantle") {
    return { provider, mantleAppId: null, customerApiToken: null };
  }
  const mantleAppId = process.env.MANTLE_APP_ID ?? null;
  const shop = await runQuery(internal.shops.getByShopInternal, {
    shop: session.shop,
  });
  return {
    provider,
    mantleAppId,
    customerApiToken: shop?.mantleApiToken ?? null,
  };
};

function PlanList() {
  const { plans, customer, subscription, subscribe } = useMantle();
  return (
    <s-stack direction="block" gap="base">
      {plans.map((plan) => {
        const active = subscription?.plan?.id === plan.id;
        return (
          <s-section
            key={plan.id}
            heading={`${plan.name}${active ? " ✓" : ""}`}
          >
            <s-paragraph>{plan.description}</s-paragraph>
            <s-paragraph>
              <s-text>
                {plan.presentmentAmount} {plan.currencyCode}
              </s-text>
            </s-paragraph>
            {!active && (
              <s-button
                onClick={async () => {
                  const result = await subscribe({ planId: plan.id });
                  if ("error" in result) {
                    console.error("Mantle subscribe failed", result);
                    return;
                  }
                  if (result.confirmationUrl && window.top) {
                    window.top.location.href = String(result.confirmationUrl);
                  }
                }}
              >
                {customer?.subscription ? "Switch plan" : "Subscribe"}
              </s-button>
            )}
          </s-section>
        );
      })}
    </s-stack>
  );
}

export default function Billing() {
  const { provider, mantleAppId, customerApiToken } =
    useLoaderData<typeof loader>();
  const { t } = useTranslation();

  if (provider !== "mantle") {
    return (
      <s-page heading={t("billing.heading")}>
        <s-section heading={t("billing.disabled.heading")}>
          <s-paragraph>{t("billing.disabled.body")}</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  if (!mantleAppId || !customerApiToken) {
    return (
      <s-page heading={t("billing.heading")}>
        <s-section heading={t("billing.notLinked.heading")}>
          <s-paragraph>{t("billing.notLinked.body")}</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={t("billing.heading")}>
      <MantleProvider
        appId={mantleAppId}
        customerApiToken={customerApiToken}
        waitForCustomer
      >
        <PlanList />
      </MantleProvider>
    </s-page>
  );
}
