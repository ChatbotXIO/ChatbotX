import { UpdateWhatsappProfile } from "@/features/integration-whatsapp/profile/update-whatsapp-profile"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params

  return <UpdateWhatsappProfile chatbotId={chatbotId} />
}
