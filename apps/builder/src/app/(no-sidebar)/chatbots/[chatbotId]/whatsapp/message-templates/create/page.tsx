import { notFound } from "next/navigation"
import { CreateMessageTemplateForm } from "@/features/integration-whatsapp/message-templates/create-message-template-form"
import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"

export default async function CreateMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const whatsappIntegration = await getWhastappIntegration({ chatbotId })
  if (!whatsappIntegration) {
    notFound()
  }

  return <CreateMessageTemplateForm chatbotId={chatbotId} />
}
