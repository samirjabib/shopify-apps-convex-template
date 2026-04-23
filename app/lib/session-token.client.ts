// app/lib/session-token.client.ts

import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";

export function useShopifySessionToken(): string | null {
  const app = useAppBridge();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const t = await app.idToken();
      if (!cancelled) setToken(t);
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [app]);

  return token;
}
