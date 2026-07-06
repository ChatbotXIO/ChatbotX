import { importTypes } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams } from "@chatbotx.io/utils"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ImportHistoryTable } from "@/features/import/components/import-history-table"
import { listImports } from "@/features/import/queries/list-imports.queries"
import { listImportsSearchParamsCache } from "@/features/import/schemas/query"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ImportContactsHistoriesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)

  const t = await getTranslations()
  const search = listImportsSearchParamsCache.parse(await props.searchParams)

  const promises = Promise.all([
    listImports({
      ...search,
      workspaceId,
      type: importTypes.enum.contacts,
    }),
  ])

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="outline">
          <Link href={`/space/${workspaceId}/contacts`}>
            <ArrowLeftIcon className="size-4" />
            <span className="sr-only">{t("actions.back")}</span>
          </Link>
        </Button>
        <h4 className="font-bold text-xl">
          {t("fields.import.histories.title")}
        </h4>
      </div>

      <Suspense>
        <ImportHistoryTable promises={promises} />
      </Suspense>
    </div>
  )
}
