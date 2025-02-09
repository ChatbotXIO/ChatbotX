import { GoogleSheetsConnect } from "@/features/integration-google-sheets/google-sheets-connect"
import { getGoogleSheetsIntegration } from "@/features/integration-google-sheets/queries"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getGoogleSheetsIntegration({
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <GoogleSheetsConnect chatbotId={params.chatbotId} promises={promises} />
  )
}
