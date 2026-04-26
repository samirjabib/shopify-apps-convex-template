import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useShopifySessionToken } from "../lib/session-token";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
            demoInfo: metafield(namespace: "$app", key: "demo_info") {
              jsonValue
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
          metafields: [
            {
              namespace: "$app",
              key: "demo_info",
              value: "Created by React Router Template",
            },
          ],
        },
      },
    },
  );
  const responseJson = await response.json();

  const product = responseJson.data?.productCreate?.product!;
  const variantId = product.variants.edges[0]?.node?.id!;

  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );

  const variantResponseJson = await variantResponse.json();

  const metaobjectResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
        metaobject {
          id
          handle
          title: field(key: "title") {
            jsonValue
          }
          description: field(key: "description") {
            jsonValue
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        handle: {
          type: "$app:example",
          handle: "demo-entry",
        },
        metaobject: {
          fields: [
            { key: "title", value: "Demo Entry" },
            {
              key: "description",
              value:
                "This metaobject was created by the Shopify app template to demonstrate the metaobject API.",
            },
          ],
        },
      },
    },
  );

  const metaobjectResponseJson = await metaobjectResponse.json();

  return {
    product: responseJson?.data?.productCreate?.product,
    variant:
      variantResponseJson?.data?.productVariantsBulkUpdate?.productVariants,
    metaobject: metaobjectResponseJson?.data?.metaobjectUpsert?.metaobject,
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const { t } = useTranslation();

  const shopify = useAppBridge();
  const sessionToken = useShopifySessionToken();
  // useAction doesn't support "skip" — gate with state
  const [shopData, setShopData] = useState<
    null | undefined | { shop: string; installedAt: number; scope?: string }
  >(undefined);
  const getShop = useAction(api.shops.get);
  useEffect(() => {
    if (!sessionToken) return;
    getShop({ sessionToken })
      .then((data) => setShopData(data ?? null))
      .catch(() => setShopData(null));
  }, [sessionToken, getShop]);
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading={t("index.pageHeading")}>
      <s-button slot="primary-action" onClick={generateProduct}>
        {t("index.generateProduct")}
      </s-button>

      <s-section heading={t("index.congrats.heading")}>
        <s-paragraph>
          This embedded app template uses{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>{" "}
          interface examples like an{" "}
          <s-link href="/app/additional">additional page in the app nav</s-link>
          , as well as an{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>{" "}
          mutation demo, to provide a starting point for app development.
        </s-paragraph>
      </s-section>
      <s-section heading={t("index.products.heading")}>
        <s-paragraph>
          {t("index.products.body")}
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            {t("index.generateProduct")}
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              {t("index.editProduct")}
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading={t("index.mutations.productCreate")}>
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>{t("index.mutations.variantUpdate")}</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>{t("index.mutations.metaobjectUpsert")}</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>
                    {JSON.stringify(fetcher.data.metaobject, null, 2)}
                  </code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading={t("index.specs.heading")}>
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
      </s-section>

      <s-section slot="aside" heading={t("index.nextSteps.heading")}>
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/getting-started/build-app-example"
              target="_blank"
            >
              {t("index.nextSteps.buildExample")}
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
              target="_blank"
            >
              {t("index.nextSteps.exploreApi")}
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading={t("index.shopData.heading")}>
        <s-paragraph>
          {shopData === undefined ? (
            <s-text>{t("index.shopData.loading")}</s-text>
          ) : shopData === null ? (
            <s-text>{t("index.shopData.noRecord")}</s-text>
          ) : (
            <s-text>
              Shop: {shopData.shop} | {t("index.shopData.installed")}{" "}
              {new Date(shopData.installedAt).toLocaleDateString()}
              {shopData.scope ? ` | ${t("index.shopData.scopes")} ${shopData.scope}` : ""}
            </s-text>
          )}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
