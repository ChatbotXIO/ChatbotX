import { getIdFromParams } from "@chatbotx.io/utils"
import { BellIcon } from "lucide-react"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getMyWorkspaceMember } from "@/features/notifications/queries"
import { UpdateNotificationsForm } from "@/features/notifications/update-notifications-form"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const workspaceMember = await getMyWorkspaceMember(workspaceId, userId)
  if (!workspaceMember) {
    return notFound()
  }

  const t = await getTranslations("personalSettings.notificationsSection")
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-foreground text-xl">
          <BellIcon className="size-5" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>
      <UpdateNotificationsForm
        notificationChannels={workspaceMember.notificationChannels ?? {}}
        notificationTypes={workspaceMember.notificationTypes ?? {}}
        workspaceId={workspaceId}
      />
    </div>
  )
}
