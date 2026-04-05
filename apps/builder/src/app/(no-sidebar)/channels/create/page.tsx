import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { Suspense } from "react"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { MessengerConnect } from "@/features/integration-messenger/components/messenger-connect"
import { SimpleCreateWebchat } from "@/features/integration-webchat/simple-create-webchat"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { ZaloConnect } from "@/features/integration-zalo/components/zalo-connect"
import { findOrganizationSettings } from "@/features/organization/queries"
import { getDomainFromHeader } from "@/lib/domain"

export const dynamic = "force-dynamic"

type CreateChannelPageProps = {
  searchParams: Promise<{
    channel?: string | null
    workspaceId?: string | null
  }>
}

export default async function CreateChannelPage(props: CreateChannelPageProps) {
  const searchParams = await props.searchParams
  const workspaceId = getIdFromParams(searchParams, "workspaceId")
  const selectedChannel = searchParams.channel

  const domain = await getDomainFromHeader()
  const settings: OrganizationSettings = await findOrganizationSettings({
    domain,
  })

  return (
    <Suspense>
      {selectedChannel === "whatsapp" && settings.whatsapp && (
        <WhatsappCreate
          settings={settings.whatsapp}
          workspaceId={workspaceId}
        />
      )}
      {selectedChannel === "messenger" && settings.messenger && (
        <MessengerConnect
          settings={settings.messenger}
          workspaceId={workspaceId}
        />
      )}
      {selectedChannel === "zalo" && settings.zalo && (
        <ZaloConnect settings={settings.zalo} workspaceId={workspaceId} />
      )}
      {selectedChannel === "webchat" && (
        <SimpleCreateWebchat workspaceId={workspaceId} />
      )}
      {!selectedChannel && <InboxSelectCard settings={settings} />}
    </Suspense>
  )
}
