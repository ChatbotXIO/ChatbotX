import { InboxType, type OrganizationSettings } from "@aha.chat/database/types"
import { headers } from "next/headers"
import { Suspense } from "react"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { findOrganizationSettings } from "@/features/organization/queries"

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

  const headersList = await headers()
  const baseUrl = new URL(headersList.get("x-url") ?? "")

  const settings: OrganizationSettings = await findOrganizationSettings({
    domain: baseUrl.hostname,
  })

  return (
    <Suspense>
      {selectedChannel === InboxType.WHATSAPP.toLowerCase() &&
        settings.whatsapp && (
          <WhatsappCreate chatbotId={chatbotId} settings={settings.whatsapp} />
        )}
      {selectedChannel === InboxType.MESSENGER.toLowerCase() && (
        <div>Messenger</div>
      )}
      {selectedChannel === InboxType.ZALO.toLowerCase() && <div>Zalo</div>}
      {selectedChannel === InboxType.WEBCHAT.toLowerCase() && (
        <div>Webchat</div>
      )}
      {!selectedChannel && <InboxSelectCard />}
    </Suspense>
  )
}
