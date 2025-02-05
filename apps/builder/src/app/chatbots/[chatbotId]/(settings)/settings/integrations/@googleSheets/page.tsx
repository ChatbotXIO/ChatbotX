import { GoogleSheetsConnect } from "@/features/integrations/google-sheets/google-sheets-connect"
import { getGoogleSheetsIntegration } from "@/features/integrations/google-sheets/queries"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getGoogleSheetsIntegration({
      chatbotId: params.chatbotId,
    }),
  ])

  return <GoogleSheetsConnect promises={promises} />
}
