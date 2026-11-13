import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { SectionErrorBoundary } from "@/components/section-error-boundary"
import { StoreCatalog } from "@/features/template-store/components/store-catalog"
import type { StoreCatalogData } from "@/features/template-store/queries/load-store-catalog"
import { InstallSection } from "@/features/templates/components/public-install-section"
import { PublicTemplateCard } from "@/features/templates/components/public-template-card"
import type {
  HomeOpenedTemplate,
  HomeTemplatesPanel as HomeTemplatesPanelKind,
} from "../lib/home-templates-view"

type HomeTemplatesPanelProps = {
  panel: HomeTemplatesPanelKind
  catalog: StoreCatalogData | null
  openedTemplate: HomeOpenedTemplate | null
  /** The signed-in user, who picks the workspace to install into. */
  userId: string
}

/** Back to the store's catalog, from a template opened inside the tab. */
function BackToTemplatesLink() {
  const t = useTranslations("home.tabs")
  return (
    <Link
      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      href="/?tab=templates"
    >
      <ArrowLeftIcon aria-hidden className="size-4" />
      {t("backToTemplates")}
    </Link>
  )
}

function PanelMessage({ children }: { children: ReactNode }) {
  return (
    <p className="py-16 text-center text-muted-foreground text-sm" role="alert">
      {children}
    </p>
  )
}

/**
 * The body of the Templates tab: the store catalog; one template with its
 * workspace picker, so it installs without leaving the home page; or why
 * neither is there.
 */
export function HomeTemplatesPanel({
  panel,
  catalog,
  openedTemplate,
  userId,
}: HomeTemplatesPanelProps) {
  const t = useTranslations()

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
  if (panel === "template" && openedTemplate) {
    return (
      <div className="flex flex-col gap-6">
        <BackToTemplatesLink />
        <PublicTemplateCard
          headingTag="h2"
          imageUrl={openedTemplate.imageUrl}
          install={null}
          template={openedTemplate.template}
        />
        {/* It reads the user's workspaces on its own: if that fails, only
            this part says so, and the home page stays. */}
        <SectionErrorBoundary
          fallback={
            <PanelMessage>{t("templateStore.store.loadFailed")}</PanelMessage>
          }
        >
          <InstallSection
            shareToken={openedTemplate.shareToken}
            userId={userId}
          />
        </SectionErrorBoundary>
      </div>
    )
  }
  if (panel === "templateUnavailable") {
    return (
      <div className="flex flex-col gap-6">
        <BackToTemplatesLink />
        <PanelMessage>
          {t("templatesPublicPage.invalidDescription")}
        </PanelMessage>
      </div>
    )
  }
  if (panel === "failed") {
    return <PanelMessage>{t("templateStore.store.loadFailed")}</PanelMessage>
  }
  return null
}
