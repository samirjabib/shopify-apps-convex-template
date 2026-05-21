import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render. Shopify embedded apps need server routes for
  // OAuth, webhooks, and Admin API loaders/actions.
  ssr: true,
} satisfies Config;
