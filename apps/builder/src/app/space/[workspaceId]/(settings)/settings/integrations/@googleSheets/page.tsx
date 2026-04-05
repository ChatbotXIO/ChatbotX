import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { GoogleSheetsManage } from "@/features/integration-google-sheets/google-sheets-manage"
import { getGoogleSheetsIntegration } from "@/features/integration-google-sheets/queries"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    getGoogleSheetsIntegration({
      workspaceId,
    }),
  ])

  return <GoogleSheetsManage promises={promises} workspaceId={workspaceId} />
}
