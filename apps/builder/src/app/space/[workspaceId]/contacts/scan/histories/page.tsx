import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams } from "@chatbotx.io/utils"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ContactScanHistoryTable } from "@/features/contact-scan/components/contact-scan-history-table"
import { requireContactScanPageAccess } from "@/features/contact-scan/lib/require-contact-scan-page-access"
import { listContactScanHistory } from "@/features/contact-scan/queries/list-contact-scan-history.queries"
import { listContactScanHistorySearchParamsCache } from "@/features/contact-scan/schema/query"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactScanHistoriesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  // An assigned-only member must not reach Page-wide scan history either
  // (plan §7 decision 10) — same gate as the scan page itself.
  await requireContactScanPageAccess(workspaceId)

  const t = await getTranslations()
  const search = listContactScanHistorySearchParamsCache.parse(
    await props.searchParams,
  )

  const promises = Promise.all([
    listContactScanHistory({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Link
          className={buttonVariants({ variant: "outline", size: "icon" })}
          href={`/space/${workspaceId}/contacts/scan`}
        >
          <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">{t("actions.back")}</span>
        </Link>

        <h4 className="font-bold text-xl">
          {t("contactScan.histories.title")}
        </h4>
      </div>

      <Suspense>
        <ContactScanHistoryTable promises={promises} />
      </Suspense>
    </div>
  )
}
