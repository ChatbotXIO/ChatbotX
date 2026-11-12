import { useTranslations } from "next-intl"
import { StoreCatalog } from "@/features/template-store/components/store-catalog"
import type { StoreCatalogData } from "@/features/template-store/queries/load-store-catalog"
import type { HomeTemplatesPanel as HomeTemplatesPanelKind } from "../lib/home-templates-view"

type HomeTemplatesPanelProps = {
  panel: HomeTemplatesPanelKind
  catalog: StoreCatalogData | null
}

/** The body of the Templates tab: the store catalog, or why it is not there. */
export function HomeTemplatesPanel({
  panel,
  catalog,
}: HomeTemplatesPanelProps) {
  const t = useTranslations("templateStore.store")

  if (panel === "catalog" && catalog) {
    return (
      <StoreCatalog
        categories={catalog.categories}
        layout="embedded"
        templates={catalog.templates}
        tenantName={catalog.tenantName}
      />
    )
  }
  if (panel === "failed") {
    return (
      <p
        className="py-16 text-center text-muted-foreground text-sm"
        role="alert"
      >
        {t("loadFailed")}
      </p>
    )
  }
  return null
}
