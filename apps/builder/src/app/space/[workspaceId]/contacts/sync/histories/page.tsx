import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams } from "@chatbotx.io/utils"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { requireContactScanPageAccess } from "@/features/contact-scan/lib/require-contact-scan-page-access"
import { ContactSyncHistoryTable } from "@/features/contact-sync/components/contact-sync-history-table"
import { listContactSyncHistory } from "@/features/contact-sync/queries/list-contact-sync-history.queries"
import { listContactSyncHistorySearchParamsCache } from "@/features/contact-sync/schema/query"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactSyncHistoriesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  // Same gate as the sync dialog: an assigned-only member sees a 404.
  await requireContactScanPageAccess(workspaceId)

  const t = await getTranslations()
  const search = listContactSyncHistorySearchParamsCache.parse(
    await props.searchParams,
  )

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Link
          className={buttonVariants({ variant: "outline", size: "icon" })}
          href={`/space/${workspaceId}/contacts`}
        >
          <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">{t("actions.back")}</span>
        </Link>
        <h4 className="font-bold text-xl">{t("contactSync.history.title")}</h4>
      </div>

      <Suspense>
        <ContactSyncHistoryTable
          promise={listContactSyncHistory({ ...search, workspaceId })}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
