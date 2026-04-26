import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { I18nextProvider } from "react-i18next";

import { createI18n, resolveLocale } from "../i18n";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const locale = resolveLocale(
    new URL(request.url).searchParams.get("locale") ??
      (session as { locale?: string }).locale,
  );
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale };
};

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();
  const i18n = useMemo(() => createI18n(locale), [locale]);

  return (
    <I18nextProvider i18n={i18n}>
      <AppProvider embedded apiKey={apiKey}>
        <s-app-nav>
          <s-link href="/app">{i18n.t("nav.home")}</s-link>
          <s-link href="/app/additional">{i18n.t("nav.additional")}</s-link>
        </s-app-nav>
        <Outlet />
      </AppProvider>
    </I18nextProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
