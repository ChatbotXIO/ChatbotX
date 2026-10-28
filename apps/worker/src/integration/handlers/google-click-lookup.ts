import {
  claimGoogleClickLookup,
  contactInboxService,
  GOOGLE_CLICK_LOOKUP_TIMEOUT_MS,
  integrationGoogleAdsService,
  isGoogleClickLookupCandidate,
  markGoogleClickLookupDone,
} from "@chatbotx.io/business"
import type { ContactInboxModel, InboxModel } from "@chatbotx.io/database/types"
import { toLogSafeError } from "@chatbotx.io/logger"
import type { IncomingMessage, MessageReferral } from "@chatbotx.io/sdk"
import {
  resolveGoogleClickCaptureSource,
  withoutRepeatedGoogleClick,
} from "@chatbotx.io/utils/google-click"
import { logger } from "../../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"

type GoogleClickLookupInput = {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  incomingMessage: IncomingMessage
}

/**
 * Reads the Google click of an EXISTING contact on a channel that only exposes
 * it through an API call (see `click-lookup.ts` for the gating policy) and
 * persists it right away, independent of whether the message is new. Never
 * throws: the message must be stored whatever happens here, and a failed
 * attempt is retried by a later message once its backoff expires.
 */
export const lookupAndPersistGoogleClick = async (
  input: GoogleClickLookupInput,
): Promise<void> => {
  const { inbox, contactInbox, incomingMessage } = input
  if (
    !isGoogleClickLookupCandidate({
      channel: inbox.channel,
      incomingMessage,
    })
  ) {
    return
  }

  try {
    // The claim comes first: it is one Redis call and bounds the database read
    // below to one per contact inbox per 5 minutes.
    if (
      !(
        (await claimGoogleClickLookup(contactInbox.id)) &&
        (await integrationGoogleAdsService.hasIntegration(inbox.workspaceId))
      )
    ) {
      return
    }

    const { integration, ctx } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: inbox.workspaceId,
        contactInbox,
      })
    const profile = await integration.runChannelHandler(
      "contact",
      "getProfile",
      {
        ctx,
        data: {
          sourceId: contactInbox.sourceId,
          includeAvatar: false,
          includeProfileSnapshot: false,
          requestTimeoutMs: GOOGLE_CLICK_LOOKUP_TIMEOUT_MS,
        },
      },
    )

    // The channel returns the click it currently knows, which is the one
    // already stored on every message after the first: only a new click moves
    // `googleClickReceivedAt` forward.
    const referral = withoutRepeatedGoogleClick(
      contactInbox.referral,
      profile.referral,
    )
    if (referral && !(await persistLookedUpReferral(input, referral))) {
      return
    }
    await markGoogleClickLookupDone(contactInbox.id)
  } catch (error) {
    logger.warn(
      {
        err: toLogSafeError(error),
        contactInboxId: contactInbox.id,
        channel: inbox.channel,
      },
      "lookupAndPersistGoogleClick: lookup failed, will retry on a later message",
    )
  }
}

/**
 * `false` when the click could not be saved. The database error text embeds the
 * query parameters (the click id), so only its type is logged, never the error.
 */
const persistLookedUpReferral = async (
  {
    inbox,
    contactInbox,
  }: Pick<GoogleClickLookupInput, "inbox" | "contactInbox">,
  referral: MessageReferral,
): Promise<boolean> => {
  try {
    // Atomic: once the click is in the snapshot a later lookup no longer offers
    // it, so it must reach the log in the same commit.
    await contactInboxService.updateTrackingAtomic({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: inbox.workspaceId,
      data: { referral },
      // The click id keys the touch; a profile lookup has no carrying event.
      referralOccurrence: { occurredAt: new Date() },
    })
    return true
  } catch (error) {
    logger.warn(
      {
        errName: error instanceof Error ? error.name : "NonError",
        contactInboxId: contactInbox.id,
        channel: inbox.channel,
      },
      "lookupAndPersistGoogleClick: could not save the click, will retry on a later message",
    )
    return false
  }
}

/**
 * A contact created through the channel's profile call already had its click
 * read there: save it (after the contact commit, through the same safe path as
 * the lookup, so a failing query cannot leak the click id) and close the
 * session so the next message needs no second call. A failed save leaves the
 * session open for the existing-contact lookup. The marker is only written for
 * Google Ads workspaces (it is per contact inbox). Never throws.
 */
export const persistNewContactGoogleClick = async (props: {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  referral: MessageReferral | null
}): Promise<void> => {
  const { inbox, contactInbox, referral } = props
  if (resolveGoogleClickCaptureSource(inbox.channel) !== "profileLookup") {
    return
  }
  try {
    if (
      referral &&
      !(await persistLookedUpReferral({ inbox, contactInbox }, referral))
    ) {
      return
    }
    if (await integrationGoogleAdsService.hasIntegration(inbox.workspaceId)) {
      await markGoogleClickLookupDone(contactInbox.id)
    }
  } catch (error) {
    logger.warn(
      {
        err: toLogSafeError(error),
        contactInboxId: contactInbox.id,
        channel: inbox.channel,
      },
      "persistNewContactGoogleClick: skipped",
    )
  }
}
