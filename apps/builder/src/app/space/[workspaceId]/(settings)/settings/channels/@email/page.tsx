import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { EmailManage } from "@/features/integration-email/email-manage"
import { listIntegrationEmails } from "@/features/integration-email/queries"

export default async function SettingChannelEmailPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = listIntegrationEmails({ workspaceId })

  return <EmailManage promises={promises} workspaceId={workspaceId} />
}
