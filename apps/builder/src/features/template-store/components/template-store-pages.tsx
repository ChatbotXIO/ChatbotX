import { templateStoreService } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { requireTemplateStoreScope } from "../access"
import {
  getTemplateStoreSearchParamsCache,
  toTemplateStoreListInput,
} from "../query"
import type { TemplateStoreScope } from "../schema"
import { ApprovedTemplatesTable } from "./approved-templates-table"
import { CategoryBar } from "./category-bar"

type TemplateStorePageProps = {
  /** Which store: the platform's own (`/admin`) or the caller's white-label (`/manage`). */
  scopeKind: TemplateStoreScope
}

/** The approved templates of one store, with search, filters and paging from the URL. */
export async function TemplateStorePage({
  scopeKind,
  searchParams,
}: TemplateStorePageProps & { searchParams: Promise<SearchParams> }) {
  const scope = await requireTemplateStoreScope(scopeKind)
  const [t, search] = await Promise.all([
    getTranslations("templateStore"),
    getTemplateStoreSearchParamsCache.parse(await searchParams),
  ])
  const input = toTemplateStoreListInput(search)
  const { listings, total, categories, activeCategoryId, storeUrl } =
    await templateStoreService.listForAdmin({ scope, ...input })

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-lg sm:text-xl">{t("title")}</h3>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        {storeUrl ? (
          <Button
            aria-label={t("openInStore")}
            nativeButton={false}
            render={<Link href={storeUrl} rel="noreferrer" target="_blank" />}
            size="icon"
            title={t("openInStore")}
            variant="outline"
          >
            <ExternalLinkIcon />
          </Button>
        ) : (
          <Button
            aria-label={t("storeUnavailable")}
            disabled
            size="icon"
            title={t("storeUnavailable")}
            variant="outline"
          >
            <ExternalLinkIcon />
          </Button>
        )}
      </div>
      <CategoryBar
        activeCategoryId={activeCategoryId}
        categories={categories}
        scope={scopeKind}
      />
      <ApprovedTemplatesTable
        categories={categories}
        hasActiveFilters={Boolean(
          input.keyword || activeCategoryId || input.status,
        )}
        listings={listings}
        pageCount={Math.ceil(total / input.perPage)}
        renderedPage={input.page}
        renderedPerPage={input.perPage}
        scope={scopeKind}
      />
    </div>
  )
}
