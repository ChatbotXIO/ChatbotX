import { platformCredentialService, tenantService } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"
import { InstagramLoginSelect } from "@/features/integration-instagram/components/instagram-login-select"
import { generateInstagramRedirectUri } from "@/features/integration-instagram/libs/oauth"
import { generateInstagramFacebookRedirectUri } from "@/features/integration-instagram/libs/oauth-facebook"
import { TelegramConnect } from "@/features/integration-telegram/components/telegram-connect"
import { generateTiktokRedirectUri } from "@/features/integration-tiktok/libs/tiktok"
import { SimpleCreateWebchat } from "@/features/integration-webchat/simple-create-webchat"
import WhatsappCreate from "@/features/integration-whatsapp/components/whatsapp-create"
import { generateZaloRedirectUri } from "@/features/integration-zalo/libs/zalo"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserId } from "@/lib/auth/utils"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"

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

  if (workspaceId) {
    await requireWorkspacePermission(workspaceId, "superAdmin")
  }

  const selectedChannel = searchParams.channel

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const platformOwnerId = await resolvePlatformOwnerId({ userId, workspaceId })

  // Two-tier channel-visibility policy (platform admin + white-label owner).
  // Pure UI gate — checked before every create branch (including the
  // self-serve telegram/webchat ones) so this page never *renders* the entry
  // point for a hidden channel, even via a direct `?channel=` deep link. This
  // is UI visibility, not authorization: the underlying connect actions
  // (e.g. `connectTelegramAction`) deliberately do not re-check the policy,
  // so a hidden channel remains creatable by invoking its action directly —
  // hiding is a hint, never an access control. Never consulted by
  // webhooks/outbound send/`Inbox` itself, so an already-connected inbox of a
  // hidden channel keeps working unaffected.
  const visibleChannels =
    await tenantService.resolveVisibleChannels(platformOwnerId)
  const isVisible = (channel: ChannelType) => visibleChannels.includes(channel)

  if (selectedChannel === "telegram" && isVisible("telegram")) {
    return <TelegramConnect autoOpen={true} workspaceId={workspaceId} />
  }

  if (selectedChannel === "webchat" && isVisible("webchat")) {
    return <SimpleCreateWebchat workspaceId={workspaceId} />
  }

  const [whatsapp, messenger, instagram, instagramFacebook, zalo, tiktok] =
    await Promise.all([
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
        type: "instagramFacebook",
      }),
      platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "zalo",
      }),
      platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "tiktok",
      }),
    ])

  if (selectedChannel === "whatsapp" && whatsapp && isVisible("whatsapp")) {
    return (
      <WhatsappCreate
        settings={whatsapp.publicConfig}
        workspaceId={workspaceId}
      />
    )
  }

  if (selectedChannel === "messenger" && messenger && isVisible("messenger")) {
    // The Facebook SSO token reuse check needs to set a cookie on a hit, which
    // a Server Component's render can't do — hand off to a Route Handler that
    // re-checks reuse and either redirects to the Page picker (cookie set) or
    // falls back to the full OAuth dialog. See that route's comment.
    redirect(
      `/channels/create/messenger${workspaceId ? `?workspaceId=${workspaceId}` : ""}`,
    )
  }

  if (selectedChannel === "instagram" && instagram && isVisible("instagram")) {
    return <InstagramLoginSelect workspaceId={workspaceId} />
  }

  if (
    selectedChannel === "instagram-direct" &&
    instagram &&
    isVisible("instagram")
  ) {
    const redirectUri = await generateInstagramRedirectUri(
      instagram.publicConfig,
      workspaceId,
    )
    redirect(redirectUri)
  }

  // `instagram-facebook` is a login-flavor route discriminator, not its own
  // `ChannelType` — it still creates an `instagram` channel, so it's gated on
  // the same `instagram` visibility flag as the other IG login paths.
  if (
    selectedChannel === "instagram-facebook" &&
    instagramFacebook &&
    isVisible("instagram")
  ) {
    const redirectUri = await generateInstagramFacebookRedirectUri(
      instagramFacebook.publicConfig,
      workspaceId,
    )
    redirect(redirectUri)
  }

  if (selectedChannel === "zalo" && zalo && isVisible("zalo")) {
    const redirectUri = await generateZaloRedirectUri(
      zalo.publicConfig,
      workspaceId,
    )
    redirect(redirectUri)
  }

  if (selectedChannel === "tiktok" && tiktok && isVisible("tiktok")) {
    const redirectUri = await generateTiktokRedirectUri(
      tiktok.publicConfig,
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
  if (tiktok) {
    configuredChannels.push("tiktok")
  }

  return (
    <InboxSelectCard
      configuredChannels={configuredChannels}
      offeredChannels={visibleChannels}
    />
  )
}
