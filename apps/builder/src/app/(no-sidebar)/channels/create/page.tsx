import { organizationService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { InstagramConnect } from "@/features/integration-instagram/components/instagram-connect"
import { MessengerConnect } from "@/features/integration-messenger/components/messenger-connect"
import { TelegramConnect } from "@/features/integration-telegram/components/telegram-connect"
import { SimpleCreateWebchat } from "@/features/integration-webchat/simple-create-webchat"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { generateZaloRedirectUri } from "@/features/integration-zalo/libs/zalo"
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

  if (selectedChannel === "telegram") {
    return <TelegramConnect autoOpen={true} workspaceId={workspaceId} />
  }

  if (selectedChannel === "webchat") {
    return <SimpleCreateWebchat workspaceId={workspaceId} />
  }

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)
  const settings = organization.settings

  if (selectedChannel === "whatsapp" && settings.whatsapp) {
    return (
      <WhatsappCreate settings={settings.whatsapp} workspaceId={workspaceId} />
    )
  }

  if (selectedChannel === "messenger" && settings.messenger) {
    return (
      <MessengerConnect
        settings={settings.messenger}
        workspaceId={workspaceId}
      />
    )
  }

  if (selectedChannel === "instagram" && settings.instagram) {
    return (
      <InstagramConnect
        settings={settings.instagram}
        workspaceId={workspaceId}
      />
    )
  }

  if (selectedChannel === "zalo" && settings.zalo) {
    const redirectUri = await generateZaloRedirectUri(
      settings.zalo,
      workspaceId,
    )
    redirect(redirectUri)
  }

  return <InboxSelectCard settings={settings} />
}
