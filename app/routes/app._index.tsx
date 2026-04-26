import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const { t } = useTranslation();

  return (
    <s-page heading={t("index.pageHeading")}>
      <s-section heading={t("index.specs.heading")}>
        <s-paragraph>{t("index.congrats.body")}</s-paragraph>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>{t("index.specs.framework")} </s-text>
            <s-link href="https://reactrouter.com/" target="_blank">
              React Router
            </s-link>
          </s-paragraph>
          <s-paragraph>
            <s-text>{t("index.specs.interface")} </s-text>
            <s-link
              href="https://shopify.dev/docs/api/app-home/using-polaris-components"
              target="_blank"
            >
              Polaris web components
            </s-link>
          </s-paragraph>
          <s-paragraph>
            <s-text>{t("index.specs.api")} </s-text>
            <s-link
              href="https://shopify.dev/docs/api/admin-graphql"
              target="_blank"
            >
              GraphQL
            </s-link>
          </s-paragraph>
          <s-paragraph>
            <s-text>{t("index.specs.customData")} </s-text>
            <s-link
              href="https://shopify.dev/docs/apps/build/custom-data"
              target="_blank"
            >
              Metafields &amp; metaobjects
            </s-link>
          </s-paragraph>
          <s-paragraph>
            <s-text>{t("index.specs.database")} </s-text>
            <s-link href="https://www.convex.dev/" target="_blank">
              Convex
            </s-link>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
