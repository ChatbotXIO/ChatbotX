import {
  isStoredImageMedia,
  type MessagingAdChannel,
  type MessagingAdCreativeMediaInput,
  type MessagingAdOperationInput,
  type MessagingAdTargetingInput,
  type MessagingAdWelcomeMessageInput,
} from "@chatbotx.io/database/partials"
import {
  integrationMessengerRepository,
  messagingAdOperationRepository,
} from "@chatbotx.io/database/repositories"
import type { MessagingAdOperationModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import {
  buildPromotedObject,
  type FacebookAdsAuthValue,
  integration as facebookAdsIntegration,
  getGraphErrorCode,
  META_STATUS,
  type MessagingAdInsight,
  type MetaAd,
  type MetaAdSet,
  type MetaCampaign,
  messagingAdConfigByChannel,
  type SpecialAdCategory,
} from "@chatbotx.io/integration-facebook-ads"
import { createId } from "@chatbotx.io/utils"
import { perChannelIntegrationIdsOrNull } from "../ads-conversion/channel-fields"
import { ChatbotXException, toPublicErrorMessage } from "../errors"
import type { IntegrationContext } from "../integration-context/build-context"
import {
  buildMessagingAdsContext,
  invalidateMessagingAdsCache,
  listCachedMessagingAdsEffectiveStatus,
  listCachedMessagingAdsInsights,
  messagingAdsConnectionService,
} from "../messaging-ads-connection"
import { mapCreativeMedia, mapTargeting, mapWelcomeMessage } from "./mappers"
import {
  type ResolvedStoredImage,
  resolveStoredImageBytes,
} from "./media-preflight"
import {
  type MessagingAdChannelAssets,
  resolveMessagingAdChannelAssets,
} from "./resolve-channel-assets"

const GRAPH_TOKEN_EXPIRED_ERROR_CODE = 190

const GENERIC_ERROR = "Could not create the ad. Please try again."

type MessagingAdsCtx = IntegrationContext<FacebookAdsAuthValue>

export type CreateMessagingAdDraftInput = {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
  whatsappPageIntegrationId?: string
  adAccountId: string
  name: string
  campaign: {
    specialAdCategories: SpecialAdCategory[]
    specialAdCategoryCountry?: string[]
  }
  adSet: {
    dailyBudgetMinorUnits: number
    targeting: MessagingAdTargetingInput
    startTime?: string
    endTime?: string
  }
  creative: {
    media: MessagingAdCreativeMediaInput
    welcomeMessage: MessagingAdWelcomeMessageInput
  }
  createdBy?: string
}

function toOperationInput(
  input: CreateMessagingAdDraftInput,
): MessagingAdOperationInput {
  return {
    adAccountId: input.adAccountId,
    whatsappPageIntegrationId: input.whatsappPageIntegrationId,
    campaign: {
      name: input.name,
      specialAdCategories: input.campaign.specialAdCategories,
      specialAdCategoryCountry: input.campaign.specialAdCategoryCountry,
    },
    adSet: {
      dailyBudgetMinorUnits: input.adSet.dailyBudgetMinorUnits,
      targeting: input.adSet.targeting,
      startTime: input.adSet.startTime,
      endTime: input.adSet.endTime,
    },
    creative: {
      media: input.creative.media,
      welcomeMessage: input.creative.welcomeMessage,
    },
  }
}

/**
 * Orchestrator over the durable operation record — creates a full messaging
 * ad (campaign -> ad set -> ad creative -> ad, all PAUSED), publishes
 * (activates campaign -> ad set -> ad in order with compensation on
 * failure), pauses, deletes, and lists with Meta's live `effective_status`.
 * ALL Graph access goes through `facebookAdsIntegration.runAction` — no raw
 * fetch here. See out/plan/ctm-ctid-ads-manager.md "Durable operation model".
 *
 * Auth is resolved per (channel, integrationId) via `buildMessagingAdsContext`
 * — the per-integration `MessagingAdsConnection` box auth, NOT the
 * workspace-wide `IntegrationFacebookAds` connection — per
 * out/plan/ctwa-ctm-ctid-box-merge.md "Auth = per-integration". `channel` +
 * `integrationId` are threaded through every method that mutates or lists.
 */
class MessagingAdCampaignService {
  /** Connected Messenger Pages for the WhatsApp wizard step's `page_id` selector — see `resolve-channel-assets.ts`. */
  listMessengerPages(workspaceId: string) {
    return integrationMessengerRepository.listByWorkspaceId(workspaceId)
  }

  /** Starts a brand-new draft: resolves assets, persists the operation record BEFORE the first Graph POST, then runs the create chain. */
  async createDraft(
    input: CreateMessagingAdDraftInput,
  ): Promise<MessagingAdOperationModel> {
    const assets = await resolveMessagingAdChannelAssets({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
      whatsappPageIntegrationId: input.whatsappPageIntegrationId,
    })

    const operationId = createId()
    const record = await messagingAdOperationRepository.create({
      id: operationId,
      workspaceId: input.workspaceId,
      channel: input.channel,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
      adAccountId: input.adAccountId,
      name: input.name,
      input: toOperationInput(input),
      createdBy: input.createdBy,
    })

    const ctx = await buildMessagingAdsContext({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
    })
    try {
      const result = await this.runCreateSteps(record, ctx, assets)
      await invalidateMessagingAdsCache(
        this.cacheScope(input.workspaceId, input.channel, input.integrationId),
      )
      return result
    } catch (error) {
      await this.markInvalidOnTokenError(
        error,
        input.workspaceId,
        input.channel,
        input.integrationId,
      )
      // Rethrow raw: the oRPC error boundary maps SdkException/FacebookAdsException
      // to the provider's public message centrally (apps/builder/src/orpc.ts).
      throw error
    }
  }

  /** Resumes a partially-created draft using the SAME operationId — `ensureX` skips any step whose Meta id is already persisted on the record, so a resume never re-creates an already-created object. */
  async retryDraft(input: {
    workspaceId: string
    operationId: string
  }): Promise<MessagingAdOperationModel> {
    // Resolve everything read-only (record, assets, Graph context) FIRST — a
    // failure here must leave the op in `failed` so it stays retryable. Only
    // once those succeed do we atomically claim the op (CAS failed -> pending)
    // right before any Graph create, so two concurrent retries of the same
    // operation can't both create a duplicate campaign/ad-set/ad tree.
    const record = await this.getOrFail(input)
    const assets = await resolveMessagingAdChannelAssets({
      workspaceId: record.workspaceId,
      channel: this.channelOf(record),
      integrationId: this.integrationIdForChannel(record),
      // The Page that backs the CTWA `promoted_object` is snapshotted in the
      // operation `input` at create time, so a WhatsApp retry re-resolves the
      // exact same assets without a full wizard resubmission.
      whatsappPageIntegrationId: record.input.whatsappPageIntegrationId,
    })
    const channel = this.channelOf(record)
    const integrationId = this.integrationIdForChannel(record)
    const ctx = await buildMessagingAdsContext({
      workspaceId: record.workspaceId,
      channel,
      integrationId,
    })

    const claimed = await messagingAdOperationRepository.claimForRetry({
      id: input.operationId,
      workspaceId: input.workspaceId,
    })
    if (!claimed) {
      throw new ChatbotXException(
        "This ad is already being retried or is not in a retryable state.",
        "messagingAdNotRetryable",
        409,
      )
    }
    try {
      const result = await this.runCreateSteps(record, ctx, assets)
      // v3 correction #8: retryDraft must invalidate the cache too — a
      // resumed create can produce a NEW metaAdId, so a previously-cached
      // effective-status batch (keyed by the OLD ad-id set) must not keep
      // serving after this operation joins the list.
      await invalidateMessagingAdsCache(
        this.cacheScope(record.workspaceId, channel, integrationId),
      )
      return result
    } catch (error) {
      await this.markInvalidOnTokenError(
        error,
        record.workspaceId,
        channel,
        integrationId,
      )
      throw error
    }
  }

  private cacheScope(
    workspaceId: string,
    channel: MessagingAdChannel,
    integrationId: string,
  ): string {
    // Mirrors `messaging-ads-connection/graph-reads.ts` scopeOf — the cache
    // key is workspace-scoped so invalidation must be too.
    return `${workspaceId}:${channel}:${integrationId}`
  }

  private async markInvalidOnTokenError(
    error: unknown,
    workspaceId: string,
    channel: MessagingAdChannel,
    integrationId: string,
  ): Promise<void> {
    if (getGraphErrorCode(error) !== GRAPH_TOKEN_EXPIRED_ERROR_CODE) {
      return
    }
    await messagingAdsConnectionService.markInvalid({
      workspaceId,
      channel,
      integrationId,
    })
  }

  /**
   * Drizzle's `pgEnum` column type is plain `string` in this codebase's
   * convention (the `.options as [string, ...string[]]` cast used when
   * building every `pgEnum` — see `schema/messaging-ad-operation.ts` — widens
   * away literal inference). The check constraint on `MessagingAdOperation`
   * guarantees the stored value is always one of the three channels, so this
   * narrowing cast is safe.
   */
  private channelOf(record: MessagingAdOperationModel): MessagingAdChannel {
    return record.channel as MessagingAdChannel
  }

  private integrationIdForChannel(record: MessagingAdOperationModel): string {
    const id =
      record.integrationWhatsappId ??
      record.integrationMessengerId ??
      record.integrationInstagramId
    if (!id) {
      throw new Error(
        `MessagingAdOperation ${record.id} has no integration id set for channel ${record.channel}`,
      )
    }
    return id
  }

  private async runCreateSteps(
    initial: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
    assets: MessagingAdChannelAssets,
  ): Promise<MessagingAdOperationModel> {
    let record = initial
    const config = messagingAdConfigByChannel[this.channelOf(record)]

    try {
      // Bounded preflight BEFORE any Graph POST (`ensureCampaign` is the
      // first one) — for a stored-image draft, re-verify ownership + size +
      // content on EVERY call (first create AND every retry) so a
      // forged/deleted/oversized object never creates an orphan
      // campaign/ad-set, and a retry always re-derives fresh bytes (the
      // image_hash itself is never persisted).
      const media = record.input.creative.media
      const resolvedImage = isStoredImageMedia(media)
        ? await resolveStoredImageBytes({
            workspaceId: record.workspaceId,
            media,
          })
        : undefined
      record = await this.ensureCampaign(record, ctx)
      record = await this.ensureAdSet(record, ctx, config, assets)
      record = await this.ensureAdCreative(
        record,
        ctx,
        config,
        assets,
        resolvedImage,
      )
      record = await this.ensureAd(record, ctx)
      return record
    } catch (error) {
      // Mark `failed` on a failure at ANY step (not only `pending`): the
      // resume path reconciles purely from the persisted `metaCampaignId`/
      // `metaAdSetId`/... ids, so `failed` never loses progress, and the list
      // view only offers Retry for `failed` — leaving `campaignCreated`/
      // `adSetCreated` intact would strand a partial op as "Creating…" forever.
      await messagingAdOperationRepository.updateCreateProgress({
        id: record.id,
        workspaceId: record.workspaceId,
        createState: "failed",
        lastError: toPublicErrorMessage(error, GENERIC_ERROR),
      })
      throw error
    }
  }

  private async ensureCampaign(
    record: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
  ): Promise<MessagingAdOperationModel> {
    if (record.metaCampaignId) {
      return record
    }
    const campaign: MetaCampaign =
      await facebookAdsIntegration.runAction<"createMessagingCampaign">(
        "createMessagingCampaign",
        {
          ctx,
          props: {
            adAccountId: record.adAccountId,
            name: record.name,
            specialAdCategories: record.input.campaign
              .specialAdCategories as SpecialAdCategory[],
            specialAdCategoryCountry:
              record.input.campaign.specialAdCategoryCountry,
          },
        },
      )
    const updated = await messagingAdOperationRepository.updateCreateProgress({
      id: record.id,
      workspaceId: record.workspaceId,
      createState: "campaignCreated",
      metaCampaignId: campaign.id,
    })
    return (
      updated ?? {
        ...record,
        metaCampaignId: campaign.id,
        createState: "campaignCreated",
      }
    )
  }

  private async ensureAdSet(
    record: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
    config: (typeof messagingAdConfigByChannel)[MessagingAdChannel],
    assets: MessagingAdChannelAssets,
  ): Promise<MessagingAdOperationModel> {
    if (record.metaAdSetId) {
      return record
    }
    if (!record.metaCampaignId) {
      throw new Error("ensureAdSet called before the campaign was created")
    }
    const adSet: MetaAdSet =
      await facebookAdsIntegration.runAction<"createMessagingAdSet">(
        "createMessagingAdSet",
        {
          ctx,
          props: {
            adAccountId: record.adAccountId,
            campaignId: record.metaCampaignId,
            name: record.name,
            dailyBudgetMinorUnits: record.input.adSet.dailyBudgetMinorUnits,
            destinationType: config.destinationType,
            promotedObject: buildPromotedObject(this.channelOf(record), {
              pageId: assets.pageId,
              whatsappPhoneNumber: assets.whatsappPhoneNumber,
            }),
            targeting: mapTargeting(
              record.input.adSet.targeting,
              record.input.campaign.specialAdCategories as SpecialAdCategory[],
            ),
            startTime: record.input.adSet.startTime,
            endTime: record.input.adSet.endTime,
          },
        },
      )
    const updated = await messagingAdOperationRepository.updateCreateProgress({
      id: record.id,
      workspaceId: record.workspaceId,
      createState: "adSetCreated",
      metaAdSetId: adSet.id,
    })
    return (
      updated ?? {
        ...record,
        metaAdSetId: adSet.id,
        createState: "adSetCreated",
      }
    )
  }

  private async ensureAdCreative(
    record: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
    config: (typeof messagingAdConfigByChannel)[MessagingAdChannel],
    assets: MessagingAdChannelAssets,
    resolvedImage: ResolvedStoredImage | undefined,
  ): Promise<MessagingAdOperationModel> {
    if (record.metaAdCreativeId) {
      return record
    }
    const media = record.input.creative.media
    const resolvedImageHash = await this.resolveImageHash(
      record,
      ctx,
      media,
      resolvedImage,
    )
    const creative =
      await facebookAdsIntegration.runAction<"createMessagingAdCreative">(
        "createMessagingAdCreative",
        {
          ctx,
          props: {
            adAccountId: record.adAccountId,
            name: record.name,
            pageId: assets.pageId,
            instagramActorId: config.needsInstagramActor
              ? assets.instagramActorId
              : undefined,
            media: mapCreativeMedia(media, resolvedImageHash),
            pageWelcomeMessage: mapWelcomeMessage(
              record.input.creative.welcomeMessage,
            ),
            callToAction: {
              type: config.ctaType,
              value: { app_destination: config.ctaAppDestination },
            },
          },
        },
      )
    const updated = await messagingAdOperationRepository.updateCreateProgress({
      id: record.id,
      workspaceId: record.workspaceId,
      createState: "creativeCreated",
      metaAdCreativeId: creative.id,
    })
    return (
      updated ?? {
        ...record,
        metaAdCreativeId: creative.id,
        createState: "creativeCreated",
      }
    )
  }

  /**
   * Stored-image creatives never persist an `image_hash` — it is derived
   * fresh at create time via the integration action (never the low-level
   * `apis/adimages.ts` directly, so the Graph auth boundary stays with
   * `runAction`). Legacy `imageHash` drafts and the video branch need no
   * Meta upload here.
   */
  private async resolveImageHash(
    record: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
    media: MessagingAdCreativeMediaInput,
    resolvedImage: ResolvedStoredImage | undefined,
  ): Promise<string | undefined> {
    if (media.kind !== "image" || !isStoredImageMedia(media)) {
      return
    }
    if (!resolvedImage) {
      // `runCreateSteps` always preflights a stored-image draft before
      // calling `ensureAdCreative` — unreachable in practice.
      throw new Error(
        "ensureAdCreative: stored-image media missing preflight bytes",
      )
    }
    const { imageHash } =
      await facebookAdsIntegration.runAction<"uploadMessagingAdImage">(
        "uploadMessagingAdImage",
        {
          ctx,
          props: {
            adAccountId: record.adAccountId,
            fileName: resolvedImage.fileName,
            mimeType: resolvedImage.mimeType,
            bytes: resolvedImage.bytes,
          },
        },
      )
    return imageHash
  }

  private async ensureAd(
    record: MessagingAdOperationModel,
    ctx: MessagingAdsCtx,
  ): Promise<MessagingAdOperationModel> {
    if (record.metaAdId) {
      return record
    }
    if (!(record.metaAdSetId && record.metaAdCreativeId)) {
      throw new Error("ensureAd called before the ad set/creative were created")
    }
    const ad: MetaAd =
      await facebookAdsIntegration.runAction<"createMessagingAd">(
        "createMessagingAd",
        {
          ctx,
          props: {
            adAccountId: record.adAccountId,
            name: record.name,
            adSetId: record.metaAdSetId,
            creativeId: record.metaAdCreativeId,
          },
        },
      )
    const updated = await messagingAdOperationRepository.updateCreateProgress({
      id: record.id,
      workspaceId: record.workspaceId,
      createState: "adCreated",
      metaAdId: ad.id,
    })
    return updated ?? { ...record, metaAdId: ad.id, createState: "adCreated" }
  }

  private async getOrFail(input: {
    workspaceId: string
    operationId: string
  }): Promise<MessagingAdOperationModel> {
    const record = await messagingAdOperationRepository.findByIdForWorkspace({
      id: input.operationId,
      workspaceId: input.workspaceId,
    })
    if (!record) {
      throw new Error("Messaging ad operation not found")
    }
    return record
  }

  /**
   * Publish (CORRECTED per plan): activates campaign -> ad set -> ad IN
   * ORDER — a paused campaign or ad set blocks delivery even if the ad
   * itself is ACTIVE. Compensates (reverts already-activated levels back to
   * PAUSED) if a later activation fails, so nothing is left half-live.
   */
  async publish(input: {
    workspaceId: string
    operationId: string
  }): Promise<MessagingAdOperationModel> {
    const record = await this.getOrFail(input)
    if (!(record.metaCampaignId && record.metaAdSetId && record.metaAdId)) {
      throw new Error(
        "Cannot publish before campaign/ad set/ad have all been created",
      )
    }
    const channel = this.channelOf(record)
    const integrationId = this.integrationIdForChannel(record)
    const identity = { workspaceId: record.workspaceId, channel, integrationId }
    const ctx = await buildMessagingAdsContext(identity)

    await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: "publishing",
    })

    // Any compensation (revert-to-PAUSED) failure means an upper level may
    // still be ACTIVE and spending — record it in `cleanupError` so it is
    // observable, never silently swallowed.
    const compensationErrors: string[] = []
    try {
      await this.setStatus(
        ctx,
        "campaign",
        record.metaCampaignId,
        "active",
        identity,
      )
      try {
        await this.setStatus(
          ctx,
          "adSet",
          record.metaAdSetId,
          "active",
          identity,
        )
      } catch (error) {
        await this.safeSetStatus(
          ctx,
          "campaign",
          record.metaCampaignId,
          "paused",
          identity,
          compensationErrors,
        )
        throw error
      }
      try {
        await this.setStatus(ctx, "ad", record.metaAdId, "active", identity)
      } catch (error) {
        await this.safeSetStatus(
          ctx,
          "adSet",
          record.metaAdSetId,
          "paused",
          identity,
          compensationErrors,
        )
        await this.safeSetStatus(
          ctx,
          "campaign",
          record.metaCampaignId,
          "paused",
          identity,
          compensationErrors,
        )
        throw error
      }
    } catch (error) {
      if (compensationErrors.length) {
        await messagingAdOperationRepository.setCleanupError({
          id: record.id,
          workspaceId: record.workspaceId,
          cleanupError: compensationErrors.join("; "),
        })
      }
      const updated = await messagingAdOperationRepository.updatePublishState({
        id: record.id,
        workspaceId: record.workspaceId,
        publishState: "publishFailed",
        lastError: toPublicErrorMessage(error, GENERIC_ERROR),
      })
      await invalidateMessagingAdsCache(
        this.cacheScope(record.workspaceId, channel, integrationId),
      )
      return updated ?? record
    }

    // Publish fully succeeded: clear any stale compensation warning left by an
    // earlier failed attempt so consumers don't keep seeing an obsolete
    // "a level may still be active" cleanupError.
    if (record.cleanupError) {
      await messagingAdOperationRepository.setCleanupError({
        id: record.id,
        workspaceId: record.workspaceId,
        cleanupError: null,
      })
    }
    const updated = await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: "published",
    })
    await invalidateMessagingAdsCache(
      this.cacheScope(record.workspaceId, channel, integrationId),
    )
    return updated ?? record
  }

  /** One-click stop-all delivery — best-effort pauses ad, ad set, and campaign. */
  async pause(input: {
    workspaceId: string
    operationId: string
  }): Promise<MessagingAdOperationModel> {
    const record = await this.getOrFail(input)
    const channel = this.channelOf(record)
    const integrationId = this.integrationIdForChannel(record)
    const identity = { workspaceId: record.workspaceId, channel, integrationId }
    const ctx = await buildMessagingAdsContext(identity)

    await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: "pausing",
    })

    const errors: string[] = []
    if (record.metaAdId) {
      await this.safeSetStatus(
        ctx,
        "ad",
        record.metaAdId,
        "paused",
        identity,
        errors,
      )
    }
    if (record.metaAdSetId) {
      await this.safeSetStatus(
        ctx,
        "adSet",
        record.metaAdSetId,
        "paused",
        identity,
        errors,
      )
    }
    if (record.metaCampaignId) {
      await this.safeSetStatus(
        ctx,
        "campaign",
        record.metaCampaignId,
        "paused",
        identity,
        errors,
      )
    }

    // A failed pause can leave a level still delivering — record it in
    // cleanupError (observable) the same way delete/publish compensation does,
    // and clear it when every level paused cleanly. Best-effort: a failed
    // cleanupError write must never block the terminal "paused" transition.
    try {
      await messagingAdOperationRepository.setCleanupError({
        id: record.id,
        workspaceId: record.workspaceId,
        cleanupError: errors.length ? errors.join("; ") : null,
      })
    } catch {
      // swallow — the publishState write below is the source of truth
    }
    const updated = await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: "paused",
      lastError: errors.length ? errors.join("; ") : null,
    })
    await invalidateMessagingAdsCache(
      this.cacheScope(record.workspaceId, channel, integrationId),
    )
    return updated ?? record
  }

  /** Best-effort delete/archive, scoped to this ChatbotX-created campaign — async on Meta's side, observable via `cleanupError`. */
  async deleteOperation(input: {
    workspaceId: string
    operationId: string
  }): Promise<MessagingAdOperationModel> {
    const record = await this.getOrFail(input)
    const channel = this.channelOf(record)
    const integrationId = this.integrationIdForChannel(record)
    const identity = { workspaceId: record.workspaceId, channel, integrationId }
    const ctx = await buildMessagingAdsContext(identity)

    await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: "deleting",
    })

    const errors: string[] = []
    if (record.metaAdId) {
      await this.safeSetStatus(
        ctx,
        "ad",
        record.metaAdId,
        "deleted",
        identity,
        errors,
      )
    }
    if (record.metaAdSetId) {
      await this.safeSetStatus(
        ctx,
        "adSet",
        record.metaAdSetId,
        "deleted",
        identity,
        errors,
      )
    }
    if (record.metaCampaignId) {
      await this.safeSetStatus(
        ctx,
        "campaign",
        record.metaCampaignId,
        "deleted",
        identity,
        errors,
      )
    }

    // Best-effort release of the stored creative image (mirrors the
    // Meta-archive best-effort pattern above, surfaced via the same
    // `cleanupError`) — retained until now so a retry could still re-derive
    // the image_hash from it.
    const media = record.input.creative.media
    if (isStoredImageMedia(media)) {
      try {
        await uploader.deleteObject(media.imageKey)
      } catch (error) {
        errors.push(
          `image(${media.imageKey}): ${toPublicErrorMessage(error, "Could not delete the stored creative image.")}`,
        )
      }
    }

    await messagingAdOperationRepository.setCleanupError({
      id: record.id,
      workspaceId: record.workspaceId,
      cleanupError: errors.length ? errors.join("; ") : null,
    })
    const updated = await messagingAdOperationRepository.updatePublishState({
      id: record.id,
      workspaceId: record.workspaceId,
      publishState: errors.length ? "deleting" : "deleted",
    })
    await invalidateMessagingAdsCache(
      this.cacheScope(record.workspaceId, channel, integrationId),
    )
    return updated ?? record
  }

  /**
   * List with Meta's live `effective_status` — never the DB's configured
   * status (out/plan "list shows Meta's effective_status"). Reports the AD's
   * effective_status (which already rolls up parent campaign/ad-set pausing AND
   * surfaces ad-level rejection/pending-review) rather than the campaign's, so
   * a rejected ad is never shown as ACTIVE. `channel` + `integrationId` are
   * REQUIRED (v3 correction #5) — every integration's Ads box shows only its
   * own ads, never another integration's in the same workspace.
   */
  async list(input: {
    workspaceId: string
    channel: MessagingAdChannel
    integrationId: string
    /** Box "Refresh" → bypass the SWR cache and re-read Meta's live effective_status now. */
    forceRefresh?: boolean
  }): Promise<
    (MessagingAdOperationModel & { effectiveStatus: string | null })[]
  > {
    const rows = await messagingAdOperationRepository.listByWorkspaceId({
      workspaceId: input.workspaceId,
      channel: input.channel,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
    })
    const adIds = rows
      .map((row) => row.metaAdId)
      .filter((id): id is string => Boolean(id))
    if (adIds.length === 0) {
      return rows.map((row) => ({ ...row, effectiveStatus: null }))
    }

    try {
      const ads = await listCachedMessagingAdsEffectiveStatus({
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationId: input.integrationId,
        adIds,
        forceRefresh: input.forceRefresh,
      })
      const byId = new Map(ads.map((ad) => [ad.id, ad]))
      return rows.map((row) => ({
        ...row,
        effectiveStatus: row.metaAdId
          ? (byId.get(row.metaAdId)?.effective_status ?? null)
          : null,
      }))
    } catch {
      // The cached read (`listCachedMessagingAdsEffectiveStatus`) already flags
      // the connection invalid on a Graph 190 via its own `withTokenInvalidation`
      // wrapper, so this catch must NOT re-mark it (that double-wrote the row) —
      // it just degrades the list to "status unknown".
      return rows.map((row) => ({ ...row, effectiveStatus: null }))
    }
  }

  /**
   * Ads Insights for the box's separate performance panel — the ONLY path the
   * insights endpoint may take. Ownership is enforced HERE, not trusted from
   * the caller: the requested `adIds`/`adAccountId` are intersected with THIS
   * workspace's own `MessagingAdOperation` rows for `(channel, integrationId,
   * adAccountId)` before any Graph read, so a workspace member can never read
   * insights for an arbitrary ad merely reachable by the stored Meta token
   * (the feature's "only ads it created" scope). Returns `[]` — never a Graph
   * call — when nothing in the request belongs to the workspace.
   */
  async listInsights(input: {
    workspaceId: string
    channel: MessagingAdChannel
    integrationId: string
    adAccountId: string
    adIds: string[]
    datePreset?: string
    forceRefresh?: boolean
  }): Promise<MessagingAdInsight[]> {
    const rows = await messagingAdOperationRepository.listByWorkspaceId({
      workspaceId: input.workspaceId,
      channel: input.channel,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
    })
    const ownedAdIds = new Set(
      rows
        .filter(
          (row): row is MessagingAdOperationModel & { metaAdId: string } =>
            row.adAccountId === input.adAccountId && Boolean(row.metaAdId),
        )
        .map((row) => row.metaAdId),
    )
    const scopedAdIds = input.adIds.filter((id) => ownedAdIds.has(id))
    if (scopedAdIds.length === 0) {
      return []
    }
    return listCachedMessagingAdsInsights({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
      adAccountId: input.adAccountId,
      adIds: scopedAdIds,
      datePreset: input.datePreset,
      forceRefresh: input.forceRefresh,
    })
  }

  /**
   * Single Graph-mutation chokepoint for campaign/ad-set/ad status changes —
   * `publish`/`pause`/`deleteOperation` (directly or via `safeSetStatus`) all
   * funnel through here, so the Graph-190 (expired/invalidated token) check
   * (v3 correction #9) only needs to live in ONE place to cover every
   * mutation path.
   */
  private async setStatus(
    ctx: MessagingAdsCtx,
    level: "campaign" | "adSet" | "ad",
    id: string,
    state: "active" | "paused" | "deleted",
    identity: {
      workspaceId: string
      channel: MessagingAdChannel
      integrationId: string
    },
  ): Promise<void> {
    const status = META_STATUS[state]
    try {
      if (level === "campaign") {
        await facebookAdsIntegration.runAction<"updateMessagingCampaignStatus">(
          "updateMessagingCampaignStatus",
          { ctx, props: { campaignId: id, status } },
        )
        return
      }
      if (level === "adSet") {
        await facebookAdsIntegration.runAction<"updateMessagingAdSetStatus">(
          "updateMessagingAdSetStatus",
          { ctx, props: { adSetId: id, status } },
        )
        return
      }
      await facebookAdsIntegration.runAction<"updateMessagingAdStatus">(
        "updateMessagingAdStatus",
        { ctx, props: { adId: id, status } },
      )
    } catch (error) {
      await this.markInvalidOnTokenError(
        error,
        identity.workspaceId,
        identity.channel,
        identity.integrationId,
      )
      throw error
    }
  }

  private async safeSetStatus(
    ctx: MessagingAdsCtx,
    level: "campaign" | "adSet" | "ad",
    id: string,
    state: "active" | "paused" | "deleted",
    identity: {
      workspaceId: string
      channel: MessagingAdChannel
      integrationId: string
    },
    errors?: string[],
  ): Promise<void> {
    try {
      await this.setStatus(ctx, level, id, state, identity)
    } catch (error) {
      errors?.push(
        `${level}(${id}): ${toPublicErrorMessage(error, GENERIC_ERROR)}`,
      )
    }
  }
}

export const messagingAdCampaignService = new MessagingAdCampaignService()
