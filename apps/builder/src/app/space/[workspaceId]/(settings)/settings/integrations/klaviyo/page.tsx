import { integrationKlaviyoService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageKlaviyo } from "@/features/integration-klaviyo/components/manage-klaviyo"

export default async function SettingIntegrationKlaviyoPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const integration =
    await integrationKlaviyoService.findByWorkspaceId(workspaceId)
  return (
    <ManageKlaviyo
      isConnected={Boolean(integration)}
      workspaceId={workspaceId}
    />
  )
}
