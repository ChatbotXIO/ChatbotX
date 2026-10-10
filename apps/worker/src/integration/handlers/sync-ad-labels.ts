import { adsConversionService, tagService } from "@chatbotx.io/business"
import { channelTypes, messageTypes } from "@chatbotx.io/database/partials"
import { tagChannelRepository } from "@chatbotx.io/database/repositories"
import type { AdsConversionChannel } from "@chatbotx.io/database/schema"
import { emitTagApplied } from "@chatbotx.io/events"
import type { ChannelLabel, MessageReferral } from "@chatbotx.io/sdk"
import { PAID_AD_REFERRAL_SOURCE } from "@chatbotx.io/utils/referral"
import { logger } from "../../lib/logger"
import { applyEvent } from "./inbox_labels/sync"
import type { ChannelType as LabelChannelType } from "./inbox_labels/types"

/**
 * Some channels auto-assign a per-ad label to a person who arrives from a paid
 * ad (Messenger: `ad_id.<AD_ID>`) but never send the label webhook for it, even
 * on pages with tag sync on. After a new ad-referred message is stored,
 * `receiveMessage` reads the person's labels and stores the ad ones through the
 * same `applyEvent` path the label webhook uses, so a later webhook for the
 * same label is a no-op.
 *
 * A referral-only webhook (ad tap on an existing thread, no message) stores no
 * message, so it gets the same-named tag locally instead; a later label sync
 * finds that tag by name and attaches the channel's label id to it.
 */

type AdLabelSource = {
  labelChannel: LabelChannelType
  /** The channel's ads-conversion identity, for "tag applied" rules. */
  conversionChannel: AdsConversionChannel
  /** `MessageReferral.source` of a paid-ad referral on this channel. */
  referralSource: string
  /** Name prefix of the auto-assigned per-ad label. */
  labelPrefix: string
}

/** Channels whose ad labels must be pulled; add a channel here to opt it in. */
const AD_LABEL_SOURCES: Partial<Record<string, AdLabelSource>> = {
  [channelTypes.enum.messenger]: {
    labelChannel: channelTypes.enum.messenger,
    conversionChannel: channelTypes.enum.messenger,
    referralSource: PAID_AD_REFERRAL_SOURCE.meta,
    labelPrefix: "ad_id.",
  },
}

/**
 * The lookup runs inline on the inbound-message path, so it fails fast instead
 * of using the channel client's default timeout and retries.
 */
export const AD_LABEL_LOOKUP_TIMEOUT_MS = 5000

type SyncAdLabelsProps = {
  /** False for an expired workspace or a standby (listen-only) delivery. */
  canAutomate: boolean
  inbox: { id: string; workspaceId: string; channel: string }
  integrationRow: { id: string; syncTagEnabledAt?: Date | null }
  referral: MessageReferral | null | undefined
  /**
   * Type of the message this delivery newly stored; undefined for a
   * referral-only webhook or a redelivered (already stored) message, so a
   * redelivery never repeats the lookup.
   */
  newMessageType: string | undefined
  sourceId: string
  listLabels: (requestTimeoutMs: number) => Promise<ChannelLabel[]>
}

const resolveAdLabelSource = (
  props: SyncAdLabelsProps,
): AdLabelSource | null => {
  const source = AD_LABEL_SOURCES[props.inbox.channel]
  const isAdReferredNewMessage =
    props.canAutomate &&
    props.newMessageType === messageTypes.enum.incoming &&
    props.referral?.source === source?.referralSource &&
    Boolean(props.referral?.adId) &&
    Boolean(props.integrationRow.syncTagEnabledAt)
  return source && isAdReferredNewMessage ? source : null
}

/**
 * Store the person's per-ad labels when a newly stored message came from a
 * paid ad. Best-effort: a lookup or save failure is logged and never fails the
 * message job that called it.
 */
export async function syncAdLabelsIfAdReferred(
  props: SyncAdLabelsProps,
): Promise<void> {
  const source = resolveAdLabelSource(props)
  if (!source) {
    return
  }
  const { inbox, integrationRow, sourceId, listLabels, referral } = props
  try {
    const labels = await listLabels(AD_LABEL_LOOKUP_TIMEOUT_MS)
    for (const label of labels) {
      if (!label.name.startsWith(source.labelPrefix)) {
        continue
      }
      await applyEvent(
        {
          channelType: source.labelChannel,
          workspaceId: inbox.workspaceId,
          integrationId: integrationRow.id,
          inboxId: inbox.id,
        },
        {
          type: "assign",
          labelId: label.id,
          labelName: label.name,
          userIds: [sourceId],
        },
      )
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        workspaceId: inbox.workspaceId,
        integrationId: integrationRow.id,
        sourceId,
        adId: referral?.adId,
      },
      "Ad label sync failed",
    )
  }
}

type TagAdReferralOnlyProps = Pick<
  SyncAdLabelsProps,
  "canAutomate" | "inbox" | "integrationRow" | "referral"
> & {
  /** True when the delivery carried no message or postback. */
  isReferralOnly: boolean
  contactInbox: { id: string; contactId: string }
}

/** The per-ad tag to apply for an ad referral-only delivery, else null. */
const resolveReferralOnlyAdTag = (
  props: TagAdReferralOnlyProps,
): { source: AdLabelSource; tagName: string } | null => {
  const source = AD_LABEL_SOURCES[props.inbox.channel]
  const adId = props.referral?.adId
  const isAdReferralOnly =
    props.canAutomate &&
    props.isReferralOnly &&
    props.referral?.source === source?.referralSource &&
    Boolean(props.integrationRow.syncTagEnabledAt)
  return source && adId && isAdReferralOnly
    ? { source, tagName: `${source.labelPrefix}${adId}` }
    : null
}

/**
 * Record the contact inbox under the tag's existing mapping to this page's
 * label id (from an earlier label lookup), so the page's later "remove label"
 * webhook can find it. Skipped while the tag has no mapping yet. Best-effort
 * and isolated: a failure here must not stop the tag's events.
 */
const recordAdTagChannelAssignment = async (
  props: TagAdReferralOnlyProps,
  source: AdLabelSource,
  tagId: string,
): Promise<void> => {
  const { inbox, integrationRow, contactInbox, referral } = props
  try {
    // Pure read, so the repository is called directly (see data-access rule).
    const tagChannel = await tagChannelRepository.findByTagAndIntegration({
      workspaceId: inbox.workspaceId,
      tagId,
      channelType: source.labelChannel,
      integrationId: integrationRow.id,
    })
    if (tagChannel) {
      await tagService.recordTagChannelAssignmentsUnscoped({
        tagId,
        tagChannelId: tagChannel.id,
        contactInboxIds: [contactInbox.id],
      })
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        workspaceId: inbox.workspaceId,
        integrationId: integrationRow.id,
        contactInboxId: contactInbox.id,
        adId: referral?.adId,
      },
      "Ad referral label mapping failed",
    )
  }
}

/**
 * Apply the per-ad tag (`ad_id.<AD_ID>`) to the contact of a referral-only
 * ad delivery. The tag is found by name or created, so repeated referrals for
 * the same ad reuse one tag; "tag applied" and the ads-conversion evaluation
 * run only on the first link. Best-effort: a failure is logged and never
 * fails the message job.
 */
export async function tagAdReferralOnlyContact(
  props: TagAdReferralOnlyProps,
): Promise<void> {
  const resolved = resolveReferralOnlyAdTag(props)
  if (!resolved) {
    return
  }
  const { source, tagName } = resolved
  const { inbox, integrationRow, contactInbox, referral } = props
  try {
    const tagId = await tagService.ensureTagByName({
      workspaceId: inbox.workspaceId,
      name: tagName,
    })
    if (!tagId) {
      return
    }
    const linked = await tagService.linkTagToContactsReturningNewUnscoped({
      tagId,
      contactIds: [contactInbox.contactId],
    })
    await recordAdTagChannelAssignment(props, source, tagId)
    if (linked.length === 0) {
      return
    }
    // The evaluation enqueue never throws (`safeEnqueue`); the event goes
    // last so its failure cannot lose a conversion for a link that exists.
    await adsConversionService.enqueueTagAppliedEvaluationsForInbox({
      workspaceId: inbox.workspaceId,
      channel: source.conversionChannel,
      inboxId: inbox.id,
      contactInboxId: contactInbox.id,
      tagIds: [tagId],
    })
    await emitTagApplied(
      inbox.workspaceId,
      contactInbox.contactId,
      tagId,
      contactInbox.id,
    )
  } catch (error) {
    logger.warn(
      {
        err: error,
        workspaceId: inbox.workspaceId,
        integrationId: integrationRow.id,
        contactInboxId: contactInbox.id,
        adId: referral?.adId,
      },
      "Ad referral tag failed",
    )
  }
}
