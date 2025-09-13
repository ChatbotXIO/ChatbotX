import { notFound } from "next/navigation"
import { findChatbot } from "@/features/chatbot/queries"
import { MessengerSelectPageCard } from "@/features/integration-messenger/components/messenger-select-page"
import { validateOrganizationSettingSchema } from "@/features/integration-messenger/schemas/organization-setting"
import { findOrganization } from "@/features/organization/queries"

type MessengerPagesPageProps = {
  params: Promise<{ chatbotId: string }>
}

export default async function MessengerPagesPage({
  params,
}: MessengerPagesPageProps) {
  const { chatbotId } = await params

  const chatbot = await findChatbot({ id: chatbotId })
  const organization = await findOrganization({ id: chatbot.organizationId })

  const { data } = validateOrganizationSettingSchema.safeParse(
    organization.settings,
  )

  if (!data) {
    return notFound()
  }

  return (
    <MessengerSelectPageCard
      appId={data.messengerClientId}
      chatbotId={chatbotId}
      version={data.messengerVersion}
    />
  )
}
