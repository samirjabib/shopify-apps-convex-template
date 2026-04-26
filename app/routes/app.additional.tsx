import { useTranslation } from "react-i18next";

export default function AdditionalPage() {
  const { t } = useTranslation();

  return (
    <s-page heading={t("additional.pageHeading")}>
      <s-section heading={t("additional.multiplePages.heading")}>
        <s-paragraph>
          {t("additional.multiplePages.body")}{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          {t("additional.multiplePages.body2")}
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading={t("additional.resources.heading")}>
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              {t("additional.resources.navBestPractices")}
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
