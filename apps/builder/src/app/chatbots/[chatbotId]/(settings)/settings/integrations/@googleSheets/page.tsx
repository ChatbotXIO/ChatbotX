import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { GoogleSheetsManage } from "@/features/integration-google-sheets/google-sheets-manage"
import { getGoogleSheetsIntegration } from "@/features/integration-google-sheets/queries"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    getGoogleSheetsIntegration({
      chatbotId,
    }),
  ])

  return <GoogleSheetsManage chatbotId={chatbotId} promises={promises} />
}
