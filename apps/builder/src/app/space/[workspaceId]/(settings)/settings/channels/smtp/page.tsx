import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationSmtps } from "@/features/integration-smtp/queries"
import { SmtpManage } from "@/features/integration-smtp/smtp-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"

export default async function SettingChannelSmtpPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireVisibleChannel(workspaceId, "smtp")

  const promises = listIntegrationSmtps({ workspaceId })

  return <SmtpManage promises={promises} workspaceId={workspaceId} />
}
