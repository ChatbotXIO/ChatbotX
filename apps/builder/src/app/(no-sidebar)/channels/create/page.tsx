import type { OrganizationSettings } from "@aha.chat/database/types"
import { Suspense } from "react"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { MessengerConnect } from "@/features/integration-messenger/components/messenger-connect"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { ZaloConnect } from "@/features/integration-zalo/components/zalo-connect"
import { findOrganizationSettings } from "@/features/organization/queries"
import { SimpleCreateWebchat } from "@/features/webchat/simple-create-webchat"
import { getDomainFromHeader } from "@/lib/domain"

export const dynamic = "force-dynamic"

type CreateChannelPageProps = {
  searchParams: Promise<{
    channel?: string | null
    chatbotId?: string | null
  }>
}

export default async function CreateChannelPage({
  searchParams,
}: CreateChannelPageProps) {
  const { channel: selectedChannel, chatbotId } = await searchParams

  const domain = await getDomainFromHeader()
  const settings: OrganizationSettings = await findOrganizationSettings({
    domain,
  })

  return (
    <Suspense>
      {selectedChannel === "whatsapp" && settings.whatsapp && (
        <WhatsappCreate chatbotId={chatbotId} settings={settings.whatsapp} />
      )}
      {selectedChannel === "messenger" && settings.messenger && (
        <MessengerConnect chatbotId={chatbotId} settings={settings.messenger} />
      )}
      {selectedChannel === "zalo" && settings.zalo && (
        <ZaloConnect chatbotId={chatbotId} settings={settings.zalo} />
      )}
      {selectedChannel === "webchat" && (
        <SimpleCreateWebchat chatbotId={chatbotId} />
      )}
      {!selectedChannel && <InboxSelectCard settings={settings} />}
    </Suspense>
  )
}
