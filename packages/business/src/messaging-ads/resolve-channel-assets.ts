import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import {
  integrationInstagramRepository,
  integrationMessengerRepository,
  integrationWhatsappRepository,
} from "@chatbotx.io/database/repositories"
import { ChatbotXException, notFoundException } from "../errors"

export type MessagingAdChannelAssets = {
  pageId: string
  instagramActorId?: string
  /** E.164 without the leading `+`, matching Meta's `promoted_object.whatsapp_phone_number` form. */
  whatsappPhoneNumber?: string
}

export type ResolveMessagingAdChannelAssetsInput = {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
  /**
   * `IntegrationMessenger.id` supplying `page_id` for the WhatsApp channel.
   * `IntegrationWhatsapp` has no `pageId` column of its own (the WABA/phone
   * number is not itself a Page) — Meta's CTWA `promoted_object` still
   * requires a `page_id` in addition to the WhatsApp number
   * (out/plan/ctwa-ads-manager.md "promoted_object"), so Phase 1 asks the
   * wizard to pick the connected Messenger Page to supply it. Required only
   * when `channel === "whatsapp"`.
   * // Phase 0 confirm: verify this Page is the one Meta actually expects
   * for the (ad account, Page, WABA, phone number) tuple authorization
   * check — a mismatched Page is exactly the "asset linkage" failure mode
   * the CTWA plan calls out.
   */
  whatsappPageIntegrationId?: string
}

const LEADING_PLUS_RE = /^\+/
const stripLeadingPlus = (value: string): string =>
  value.replace(LEADING_PLUS_RE, "")

/**
 * Channel-agnostic asset resolver — mirrors the `channelUserDataBuilders` /
 * `ADS_INTEGRATION_FK_BY_CHANNEL` resolver-map pattern (no per-channel
 * `if`/`switch` here). Resolves the Page id (+ Instagram actor id for CTID, +
 * WhatsApp number for CTWA) a specific connected integration row backs, so
 * the create flow never asks the wizard to supply these directly (derived,
 * per out/plan/ctm-ctid-ads-manager.md "destination_type/app_destination are
 * derived from channel, never user inputs" — the same principle extends to
 * the assets the ad is actually promoting).
 */
const channelAssetResolvers: Record<
  MessagingAdChannel,
  (
    input: ResolveMessagingAdChannelAssetsInput,
  ) => Promise<MessagingAdChannelAssets>
> = {
  messenger: async ({ workspaceId, integrationId }) => {
    const integration =
      await integrationMessengerRepository.findWorkspaceIntegration({
        id: integrationId,
        workspaceId,
      })
    if (!integration) {
      throw notFoundException("Messenger integration not found")
    }
    if (!integration.pageId) {
      throw new ChatbotXException(
        "This Messenger channel has no linked Facebook Page. Reconnect it before creating an ad.",
        "messagingAdPageMissing",
        400,
      )
    }
    return { pageId: integration.pageId }
  },
  instagram: async ({ workspaceId, integrationId }) => {
    const integration =
      await integrationInstagramRepository.findWorkspaceIntegration({
        id: integrationId,
        workspaceId,
      })
    if (!integration) {
      throw notFoundException("Instagram integration not found")
    }
    // Fail BEFORE the campaign is created — a missing Page or Instagram actor
    // id would otherwise only surface as a Meta rejection at the ad-creative
    // step, leaving an orphaned paused campaign + ad set behind (CTID requires
    // object_story_spec.instagram_actor_id).
    if (!integration.pageId) {
      throw new ChatbotXException(
        "This Instagram channel has no linked Facebook Page. Reconnect it before creating an ad.",
        "messagingAdPageMissing",
        400,
      )
    }
    if (!integration.igId) {
      throw new ChatbotXException(
        "This Instagram channel is missing its Instagram professional account id. Reconnect it before creating an ad.",
        "messagingAdInstagramActorMissing",
        400,
      )
    }
    return { pageId: integration.pageId, instagramActorId: integration.igId }
  },
  whatsapp: async ({
    workspaceId,
    integrationId,
    whatsappPageIntegrationId,
  }) => {
    if (!whatsappPageIntegrationId) {
      throw new ChatbotXException(
        "A connected Messenger Page must be selected to supply page_id for a WhatsApp messaging ad",
        "messagingAdWhatsappPageRequired",
        400,
      )
    }
    const [whatsappIntegration, pageIntegration] = await Promise.all([
      integrationWhatsappRepository.findByIdForWorkspace({
        id: integrationId,
        workspaceId,
      }),
      integrationMessengerRepository.findWorkspaceIntegration({
        id: whatsappPageIntegrationId,
        workspaceId,
      }),
    ])
    if (!whatsappIntegration) {
      throw notFoundException("WhatsApp integration not found")
    }
    if (!pageIntegration) {
      throw notFoundException("Messenger (Page) integration not found")
    }
    if (!pageIntegration.pageId) {
      throw new ChatbotXException(
        "The selected Facebook Page is not fully connected. Reconnect it before creating an ad.",
        "messagingAdPageMissing",
        400,
      )
    }
    // `displayPhoneNumber` schema-defaults to "" — an incomplete/legacy
    // WhatsApp row would otherwise pass here and only throw in `ensureAdSet`,
    // AFTER the campaign was already created (orphaned paused campaign).
    const whatsappPhoneNumber = stripLeadingPlus(
      whatsappIntegration.displayPhoneNumber ?? "",
    )
    if (!whatsappPhoneNumber) {
      throw new ChatbotXException(
        "This WhatsApp channel has no phone number configured. Reconnect it before creating an ad.",
        "messagingAdWhatsappPhoneMissing",
        400,
      )
    }
    return {
      pageId: pageIntegration.pageId,
      whatsappPhoneNumber,
    }
  },
}

export function resolveMessagingAdChannelAssets(
  input: ResolveMessagingAdChannelAssetsInput,
): Promise<MessagingAdChannelAssets> {
  return channelAssetResolvers[input.channel](input)
}
