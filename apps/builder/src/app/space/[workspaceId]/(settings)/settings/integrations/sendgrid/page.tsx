import { integrationSendGridService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageSendGrid } from "@/features/integration-sendgrid/components/manage-sendgrid"

export default async function SettingIntegrationSendGridPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const integration =
    await integrationSendGridService.findByWorkspaceId(workspaceId)
  return (
    <ManageSendGrid
      isConnected={Boolean(integration)}
      workspaceId={workspaceId}
    />
  )
}
