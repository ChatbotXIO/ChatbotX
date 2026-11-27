import { contactSyncService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams, zodBigintIdAsString } from "@chatbotx.io/utils"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { requireContactScanPageAccess } from "@/features/contact-scan/lib/require-contact-scan-page-access"
import { ContactSyncProgress } from "@/features/contact-sync/components/contact-sync-progress"
import { contactSyncHistoryPath } from "@/features/contact-sync/lib/routes"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

/** One sync run: per-page progress, live while the run is, with cancel. */
export default async function ContactSyncRunPage(props: {
  params: Promise<{ workspaceId: string; runId: string }>
}) {
  const params = await props.params
  const workspaceId = getIdFromParams(params, "workspaceId")
  const runId = getIdFromParams(params, "runId")
  // Digits that fit a bigint, so no out-of-range id reaches the query.
  if (
    !(workspaceId && runId && zodBigintIdAsString().safeParse(runId).success)
  ) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  await requireContactScanPageAccess(workspaceId)
  // A run of another workspace (or none) is a 404, not an error to retry.
  const run = await contactSyncService
    .get({ workspaceId, runId })
    .catch((error: unknown) => {
      if (error instanceof ChatbotXException) {
        return null
      }
      throw error
    })
  if (!run) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Link
          className={buttonVariants({ variant: "outline", size: "icon" })}
          href={contactSyncHistoryPath(workspaceId)}
        >
          <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">{t("actions.back")}</span>
        </Link>
        <h4 className="font-bold text-xl">{t("contactSync.history.run")}</h4>
      </div>

      <ContactSyncProgress runId={runId} workspaceId={workspaceId} />
    </div>
  )
}
