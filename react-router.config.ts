import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // Server-side render. Shopify embedded apps need server routes for
  // OAuth, webhooks, and Admin API loaders/actions.
  ssr: true,
  // Vercel preset wires the Vercel build output (functions + edge config)
  // when deployed via `vercel deploy`. Local `npm run dev` and other hosts
  // ignore the preset transparently.
  presets: [vercelPreset()],
} satisfies Config;
