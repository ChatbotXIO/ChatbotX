import { CreateMessageTemplateForm } from "@/features/integration-whatsapp/message-templates/create-message-template-form"
import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"

export default async function CreateMessageTemplatePage({
  params,
}: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId } = await params
  const promises = Promise.all([
    getWhastappIntegration({
      chatbotId: chatbotId,
    }),
  ])

  return <CreateMessageTemplateForm chatbotId={chatbotId} promises={promises} />
}
