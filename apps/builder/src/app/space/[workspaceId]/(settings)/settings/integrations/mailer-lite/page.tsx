import { integrationMailerLiteService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageMailerLite } from "@/features/integration-mailer-lite/components/manage-mailer-lite"

export default async function SettingIntegrationMailerLitePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const integration =
    await integrationMailerLiteService.findByWorkspaceId(workspaceId)
  return (
    <ManageMailerLite
      isConnected={Boolean(integration)}
      workspaceId={workspaceId}
    />
  )
}
