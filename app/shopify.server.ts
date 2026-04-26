import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { internal } from "../convex/_generated/api";
import { runMutation } from "./convex.server";
import { ConvexSessionStorage } from "./lib/session-storage.server";

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecretKey = process.env.SHOPIFY_API_SECRET;
const appUrl = process.env.SHOPIFY_APP_URL;
if (!apiKey) throw new Error("SHOPIFY_API_KEY not set");
if (!apiSecretKey) throw new Error("SHOPIFY_API_SECRET not set");
if (!appUrl) throw new Error("SHOPIFY_APP_URL not set");

const shopify = shopifyApp({
  apiKey,
  apiSecretKey,
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new ConvexSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session }) => {
      try {
        await runMutation(internal.shops.upsertInternal, {
          shop: session.shop,
          scope: session.scope,
        });
      } catch (err) {
        // Surface clearly: the shop record is required for downstream features
        // (Convex queries by shop, billing, analytics). Awaiting + logging
        // ensures install failures are visible instead of silently completing.
        console.error("afterAuth upsertInternal failed", err);
        throw err;
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
