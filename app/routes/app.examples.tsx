// Reference examples for the boilerplate. Safe to delete in your real app.
// - Admin GraphQL mutation flow (product create → variant update → metaobject upsert)
// - Direct browser → Convex action call gated by Shopify session token
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
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
                node { id price barcode createdAt }
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
      mutation updateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price barcode createdAt }
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
      mutation upsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
            title: field(key: "title") { jsonValue }
            description: field(key: "description") { jsonValue }
          }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        handle: { type: "$app:example", handle: "demo-entry" },
        metaobject: {
          fields: [
            { key: "title", value: "Demo Entry" },
            {
              key: "description",
              value: "Created by the Shopify app template demo",
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

export default function Examples() {
  const fetcher = useFetcher<typeof action>();
  const { t } = useTranslation();
  const shopify = useAppBridge();
  const sessionToken = useShopifySessionToken();

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
      shopify.toast.show(t("examples.productCreated"));
    }
  }, [fetcher.data?.product?.id, shopify, t]);

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading={t("examples.pageHeading")}>
      <s-button slot="primary-action" onClick={generateProduct}>
        {t("examples.generateProduct")}
      </s-button>

      <s-section heading={t("examples.adminApi.heading")}>
        <s-paragraph>{t("examples.adminApi.body")}</s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            {t("examples.generateProduct")}
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
              {t("examples.editProduct")}
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading="productCreate">
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
              <s-heading>productVariantsBulkUpdate</s-heading>
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
              <s-heading>metaobjectUpsert</s-heading>
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

      <s-section heading={t("examples.convex.heading")}>
        <s-paragraph>{t("examples.convex.body")}</s-paragraph>
        <s-paragraph>
          {shopData === undefined ? (
            <s-text>{t("examples.convex.loading")}</s-text>
          ) : shopData === null ? (
            <s-text>{t("examples.convex.noRecord")}</s-text>
          ) : (
            <s-text>
              Shop: {shopData.shop} | {t("examples.convex.installed")}{" "}
              {new Date(shopData.installedAt).toLocaleDateString()}
              {shopData.scope
                ? ` | ${t("examples.convex.scopes")} ${shopData.scope}`
                : ""}
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
