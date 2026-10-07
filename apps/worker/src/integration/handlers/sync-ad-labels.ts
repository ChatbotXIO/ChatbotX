import { channelTypes, messageTypes } from "@chatbotx.io/database/partials"
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
 */

type AdLabelSource = {
  labelChannel: LabelChannelType
  /** `MessageReferral.source` of a paid-ad referral on this channel. */
  referralSource: string
  /** Name prefix of the auto-assigned per-ad label. */
  labelPrefix: string
}

/** Channels whose ad labels must be pulled; add a channel here to opt it in. */
const AD_LABEL_SOURCES: Partial<Record<string, AdLabelSource>> = {
  [channelTypes.enum.messenger]: {
    labelChannel: channelTypes.enum.messenger,
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
