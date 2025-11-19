import { InboxType, type OrganizationSettings } from "@aha.chat/database/types"
import { headers } from "next/headers"
import { Suspense } from "react"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { MessengerConnect } from "@/features/integration-messenger/components/messenger-connect"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { ZaloConnect } from "@/features/integration-zalo/components/zalo-connect"
import { findOrganizationSettings } from "@/features/organization/queries"
import { SimpleCreateWebchat } from "@/features/webchat/simple-create-webchat"

type CreateChannelPageProps = {
  searchParams: Promise<{
    channel?: string | null
    chatbotId?: string | null
  }>
}

export const dynamic = "force-dynamic"

export default async function CreateChannelPage({
  searchParams,
}: CreateChannelPageProps) {
  const { channel: selectedChannel, chatbotId } = await searchParams

  const headersList = await headers()
  const baseUrl = new URL(headersList.get("x-url") ?? "")

  const settings: OrganizationSettings = await findOrganizationSettings({
    domain: baseUrl.hostname,
  })

  return (
    <Suspense>
      {selectedChannel === InboxType.whatsapp && settings.whatsapp && (
        <WhatsappCreate chatbotId={chatbotId} settings={settings.whatsapp} />
      )}
      {selectedChannel === InboxType.messenger && settings.messenger && (
        <MessengerConnect chatbotId={chatbotId} settings={settings.messenger} />
      )}
      {selectedChannel === InboxType.zalo && settings.zalo && (
        <ZaloConnect chatbotId={chatbotId} settings={settings.zalo} />
      )}
      {selectedChannel === InboxType.webchat && (
        <SimpleCreateWebchat chatbotId={chatbotId} />
      )}
      {!selectedChannel && <InboxSelectCard settings={settings} />}
    </Suspense>
  )
}
