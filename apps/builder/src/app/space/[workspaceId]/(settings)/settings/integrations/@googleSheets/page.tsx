import { integrationGoogleSheetService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { GoogleSheetsManage } from "@/features/integration-google-sheets/google-sheets-manage"
import { integrationGoogleSheetsResource } from "@/features/integration-google-sheets/schemas"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const integrationGoogleSheetsRow =
    await integrationGoogleSheetService.findByWorkspaceId(workspaceId)

  const { data } = integrationGoogleSheetsResource.safeParse(
    integrationGoogleSheetsRow,
  )

  return (
    <GoogleSheetsManage
      integrationGoogleSheets={data}
      workspaceId={workspaceId}
    />
  )
}
