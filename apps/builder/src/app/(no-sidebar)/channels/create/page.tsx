import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { TelegramConnect } from "@/features/integration-telegram/components/telegram-connect"
import { SimpleCreateWebchat } from "@/features/integration-webchat/simple-create-webchat"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { generateZaloRedirectUri } from "@/features/integration-zalo/libs/zalo"
import { getCurrentUserId } from "@/lib/auth/utils"

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

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const platformOwnerId = workspaceId
    ? ((await workspaceService.find({ where: { id: workspaceId } }))?.ownerId ??
      userId)
    : userId

  const [whatsapp, messenger, instagram, zalo] = await Promise.all([
    platformCredentialService.resolveForOwner({
      ownerId: platformOwnerId,
      type: "whatsapp",
    }),
    platformCredentialService.resolveForOwner({
      ownerId: platformOwnerId,
      type: "messenger",
    }),
    platformCredentialService.resolveForOwner({
      ownerId: platformOwnerId,
      type: "instagram",
    }),
    platformCredentialService.resolveForOwner({
      ownerId: platformOwnerId,
      type: "zalo",
    }),
  ])

  if (selectedChannel === "whatsapp" && whatsapp) {
    return (
      <WhatsappCreate
        settings={whatsapp.publicConfig}
        workspaceId={workspaceId}
      />
    )
  }

  if (selectedChannel === "zalo" && zalo) {
    const redirectUri = await generateZaloRedirectUri(
      zalo.publicConfig,
      workspaceId,
    )
    redirect(redirectUri)
  }

  const configuredChannels: ChannelType[] = []
  if (whatsapp) {
    configuredChannels.push("whatsapp")
  }
  if (messenger) {
    configuredChannels.push("messenger")
  }
  if (instagram) {
    configuredChannels.push("instagram")
  }
  if (zalo) {
    configuredChannels.push("zalo")
  }

  return (
    <InboxSelectCard
      configuredChannels={configuredChannels}
      instagramPublicConfig={instagram?.publicConfig ?? null}
      messengerPublicConfig={messenger?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
