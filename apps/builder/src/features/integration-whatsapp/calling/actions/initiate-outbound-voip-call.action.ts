"use server"

import {
  contactService,
  conversationService,
  WhatsappCallInProgressError,
  whatsappVoipCallService,
  whatsappVoipSignalingService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  WhatsappCallPendingOutboundExistsError,
} from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  canPerformCallAction,
  connectCall,
  getCallPermissions,
  terminateCall,
  type WhatsappConnectCallInput,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { WhatsappException } from "@chatbotx.io/integration-whatsapp/exception"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { BLOCKED_OUTBOUND_COUNTRIES } from "./blocked-outbound-countries"
import {
  buildCallAnnouncementOptions,
  hasCallAnnouncementOptions,
  isCallAnnouncementValidationError,
} from "./call-announcement-options"
import {
  isBlockedBusinessCallingCountry,
  resolveContactInbox,
  resolveDialIdentity,
} from "./outbound-dial-target"
import { recordCallRecordingArrangement } from "./record-call-recording-arrangement"

/** Same SDP size bound the inbound answer path applies (see `answer-voip-call.action.ts`). */
const MAX_SDP_OFFER_CHARS = 100_000

/**
 * How long the consumer has to accept before the dial is abandoned. Kept
 * strictly under the 90s stale-call sweeper so the sweeper can never
 * finalize a dial that is still legitimately ringing.
 *
 * Not exported: a `"use server"` file may only export async functions, and
 * this constant is used only within this module.
 */
const OUTBOUND_DIAL_DEADLINE_MS = 60_000

const initiateOutboundVoipCallSchema = z.object({
  conversationId: zodBigintAsString(),
  /**
   * Optional pin to a specific WhatsApp number when the contact has more
   * than one connected `ContactInbox` row — mirrors the optional `inboxId`
   * narrowing already used by `requestCallPermissionAction`.
   */
  contactInboxId: zodBigintAsString().optional(),
  sdpOffer: z.string().min(1).max(MAX_SDP_OFFER_CHARS),
})

/**
 * Discriminated outcome for the outbound VoIP dial attempt. `dialing` is the
 * only success case; every other member is an expected, non-exceptional
 * eligibility/permission/Meta-error outcome the client UI branches on
 * directly. The
 * SDP answer itself is never returned here — it arrives later via the
 * `whatsappCallOutboundAnswer` realtime event.
 */
export type InitiateOutboundVoipCallResult =
  | {
      outcome: "dialing"
      whatsappCallId: string
      wacid: string
      attemptId: string
      deadlineAt: string
      /**
       * True only when the BROWSER MediaRecorder should capture this call —
       * `callRecordingEnabled && callRecordingMode === "browserWhisper"`.
       * Under the default `metaNative` mode, Meta records the call
       * server-side and the browser must never also record it.
       */
      browserRecordingEnabled: boolean
      /**
       * True when recording was requested in ANY form — either Meta-native
       * (a `recording` announcement object was attached to `connect`) or
       * browser-side (`browserRecordingEnabled`). Purely a display signal for
       * the call panel's "recording requested" indicator; it does not by
       * itself start any capture.
       */
      recordingRequested: boolean
    }
  | { outcome: "needsPermission" }
  | { outcome: "permissionCheckFailed" }
  | { outcome: "callAlreadyInProgress" }
  | { outcome: "dailyLimitReached" }
  | { outcome: "ineligibleNumber" }
  | { outcome: "recipientUncallable" }
  | { outcome: "temporarilyDisabled" }
  | { outcome: "rateLimited" }
  | { outcome: "paymentIssue" }
  | { outcome: "callingNotEnabled" }
  | { outcome: "callFailed" }

/**
 * Best-effort teardown of a leg Meta already connected but this dial will not
 * keep: ends the local call control (if it was created) and hangs up at Meta.
 * Never throws — each failure is logged, and Meta also drops an unanswered
 * leg on its own timeout.
 */
async function abandonOutboundDial(input: {
  auth: WhatsappAuthValue
  wacid: string
  attemptId: string
}): Promise<void> {
  const { auth, wacid, attemptId } = input
  await whatsappVoipCallService
    .endCall({ wacid, allowFromAccepted: true })
    .catch((error: unknown) => {
      logger.error(
        { err: error, wacid, attemptId },
        "WhatsApp outbound dial: failed to end the local call control",
      )
    })
  await terminateCall({ auth, callId: wacid }).catch((error: unknown) => {
    logger.error(
      { err: error, wacid, attemptId },
      "WhatsApp outbound dial: best-effort terminate at Meta failed",
    )
  })
}

/**
 * Wraps {@link connectCall} with the announcement-options safeguard: on a 4xx
 * specific to these fields, retry once with the object omitted rather than
 * failing the call. Meta documents no error code for a bad
 * `purpose`/`announcement_language`, so a 4xx qualifies only when it is not
 * one of Meta's documented calling errors (see
 * `isCallAnnouncementValidationError`), and only when announcement options
 * were actually attached.
 */
async function connectCallWithAnnouncementFallback(
  input: WhatsappConnectCallInput,
): Promise<{
  wacid: string
  announcementApplied: boolean
  announcementError?: unknown
}> {
  const announcementAttached = hasCallAnnouncementOptions({
    recording: input.recording,
    transcription: input.transcription,
  })
  try {
    const connected = await connectCall(input)
    return { ...connected, announcementApplied: announcementAttached }
  } catch (error) {
    const { recording, transcription, ...withoutAnnouncementOptions } = input
    if (
      !(
        hasCallAnnouncementOptions({ recording, transcription }) &&
        isCallAnnouncementValidationError(error)
      )
    ) {
      throw error
    }
    logger.warn(
      { err: error, attemptId: input.attemptId },
      "WhatsApp outbound connect: retrying without recording/transcription announcement options after a Meta 4xx",
    )
    const connected = await connectCall(withoutAnnouncementOptions)
    // Meta placed the call WITHOUT recording/transcription: nothing will ever
    // be recorded for it, so the caller must not advertise one.
    // Surfaced by the caller: the call is placed but NOT being recorded.
    return {
      ...connected,
      announcementApplied: false,
      announcementError: error,
    }
  }
}

/**
 * Maps a Meta calling error code (`WhatsappException.code`) to the typed
 * outcome the client renders. Codes that only make sense for OTHER call
 * actions (e.g. 138007 connect timeout, or media-drop codes) fall through to
 * the generic `callFailed`.
 */
function mapMetaErrorCodeToOutcome(
  code: string | number,
): Exclude<InitiateOutboundVoipCallResult, { outcome: "dialing" }>["outcome"] {
  switch (code) {
    case 138_006:
      return "needsPermission"
    case 138_000:
      return "callingNotEnabled"
    case 138_003:
      return "callAlreadyInProgress"
    case 138_012:
      return "dailyLimitReached"
    case 138_013:
      return "ineligibleNumber"
    case 138_001:
      return "recipientUncallable"
    case 138_014:
      return "temporarilyDisabled"
    case 138_005:
    case 138_002:
      return "rateLimited"
    case 131_044:
      return "paymentIssue"
    default:
      return "callFailed"
  }
}

/**
 * Initiates a business-initiated (outbound) WhatsApp VoIP call: the browser
 * has already built its SDP OFFER (via `createOffer`/ICE gathering); this
 * action runs the O0 eligibility gate, the O5 glare guard, creates the
 * pending `WhatsappCall` row, places Meta's `connect`, and schedules the
 * durable answer-deadline expiry. Unlike `answerWhatsappVoipCallAction`,
 * this action calls the Graph client directly — the business, not the
 * worker, generates the OFFER, so there is no async webhook round-trip
 * before Meta's `connect` response.
 *
 * Eligibility/permission/glare outcomes are returned as a typed
 * discriminated union rather than thrown — every one of them is an expected
 * branch the client UI renders directly (request-permission dialog, "already
 * in progress" toast, etc.), not an application error.
 */
export const initiateOutboundVoipCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(initiateOutboundVoipCallSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }): Promise<InitiateOutboundVoipCallResult> => {
      const t = await getTranslations()
      const { conversationId, contactInboxId, sdpOffer } = parsedInput

      const conversation = await conversationService.findBy({
        where: { id: conversationId, workspaceId },
      })
      if (!conversation) {
        throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
      }

      const resolvedContactInbox = await resolveContactInbox({
        contactId: conversation.contactId,
        contactInboxId,
      })
      if (
        !resolvedContactInbox ||
        resolvedContactInbox.channel !== channelTypes.enum.whatsapp
      ) {
        throw new ChatbotXException(
          t("whatsapp.calls.errors.notWhatsappConversation"),
        )
      }

      const integration =
        await integrationWhatsappRepository.findByInboxIdForWorkspace({
          workspaceId,
          inboxId: resolvedContactInbox.inboxId,
        })
      if (!integration) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }

      // O0 gate #1: business-number country block. Fails open
      // on an unparsable number — Meta's 138013 is the backstop.
      //
      // TODO O0: `calling.status === "ENABLED"`, the calls-webhook
      // subscription, and `restrictions_list` are additional Meta-side
      // eligibility signals backstopped by error codes 138013/138018/138014
      // respectively. The resolved `integration` row does not currently
      // carry that data, so this gate intentionally does not fetch it here —
      // add the check if/when that data becomes available on the row rather
      // than inventing a new fetch.
      if (
        isBlockedBusinessCallingCountry(
          integration.displayPhoneNumber,
          BLOCKED_OUTBOUND_COUNTRIES,
        )
      ) {
        return { outcome: "ineligibleNumber" }
      }

      // Addressing (phone number vs BSUID) is the same rule the outbound
      // message path uses, and the permissions GET takes the same shape.
      const { to, recipient, permissionTarget } =
        resolveDialIdentity(resolvedContactInbox)
      const useRecipient = recipient !== undefined
      const auth = integration.auth as WhatsappAuthValue

      // Best-effort: the contact's locale only feeds the announcement
      // language fallback (`buildCallAnnouncementOptions`) when the
      // integration has not configured `callAnnouncementLanguage` — a
      // missing/unfetchable contact still degrades to Meta's `en_US`
      // default via `resolveAnnouncementLanguage`, never blocks the dial.
      // Prefer the per-channel `ContactInbox.language` (what the contact
      // panel's "Language" field writes) over the auto-derived
      // `Contact.locale`, so an explicit English choice actually changes the
      // spoken announcement.
      const contact = await contactService.findBy({
        where: { id: conversation.contactId },
      })
      const announcementOptions = buildCallAnnouncementOptions(
        integration,
        resolvedContactInbox.language ?? contact?.locale ?? undefined,
      )

      // The permissions GET itself failing (Meta 5xx / 613 rate-limit) is
      // NOT the same as a successful GET reporting no permission: treating
      // it as `needsPermission` would open the request-permission dialog and
      // burn the contact's 1-per-24h permission-request quota on a check
      // that never actually ran. Fail closed (never dial) without spending
      // that quota.
      let permissions: Awaited<ReturnType<typeof getCallPermissions>>
      try {
        permissions = await getCallPermissions(auth, permissionTarget)
      } catch (error) {
        logger.error(
          { err: error, integrationId: integration.id },
          "Failed to read WhatsApp call permissions before outbound dial",
        )
        return { outcome: "permissionCheckFailed" }
      }
      if (!canPerformCallAction(permissions, "start_call")) {
        return { outcome: "needsPermission" }
      }

      try {
        await whatsappVoipCallService.assertNoActiveCallForContact({
          inboxId: resolvedContactInbox.inboxId,
          contactInboxId: resolvedContactInbox.id,
        })
      } catch (error) {
        if (error instanceof WhatsappCallInProgressError) {
          return { outcome: "callAlreadyInProgress" }
        }
        throw error
      }

      const attemptId = crypto.randomUUID()
      // `assertNoActiveCallForContact` above is read-then-write: two
      // simultaneous dials for the same contact can both pass the check and
      // race here. The loser hits the DB's one-pending-per-contact-inbox
      // partial unique index and throws
      // `WhatsappCallPendingOutboundExistsError` — map that to the same
      // typed outcome as the glare guard rather than letting it surface as a
      // generic server error (mirrors `start-call.action.ts`).
      let pending: { id: string }
      try {
        pending = await whatsappVoipCallService.createOutboundAttempt({
          attemptId,
          workspaceId,
          inboxId: resolvedContactInbox.inboxId,
          contactInboxId: resolvedContactInbox.id,
          conversationId: conversation.id,
          agentUserId: ctx.user.id,
        })
      } catch (error) {
        if (error instanceof WhatsappCallPendingOutboundExistsError) {
          return { outcome: "callAlreadyInProgress" }
        }
        throw error
      }

      let wacid: string
      let announcementApplied = false
      let announcementError: unknown
      try {
        const connected = await connectCallWithAnnouncementFallback({
          auth,
          sdpOffer,
          attemptId,
          ...announcementOptions,
          // Exactly one of `to`/`recipient` per `WhatsappConnectCallInput`.
          ...(useRecipient ? { recipient: recipient ?? "" } : { to: to ?? "" }),
        })
        wacid = connected.wacid
        announcementApplied = connected.announcementApplied
        announcementError = connected.announcementError
      } catch (error) {
        const code =
          error instanceof WhatsappException ? error.code : "callFailed"
        await whatsappVoipCallService
          .finalizeEndedCall({
            whatsappCallId: pending.id,
            status: "failed",
            endedAt: new Date(),
            lastError: String(code),
          })
          .catch((finalizeError: unknown) => {
            logger.error(
              { err: finalizeError, whatsappCallId: pending.id, attemptId },
              "WhatsApp outbound dial: failed to finalize pending row after connect failure",
            )
          })
        logger.error(
          { err: error, whatsappCallId: pending.id, attemptId },
          "WhatsApp outbound connect call failed",
        )
        return {
          outcome:
            error instanceof WhatsappException
              ? mapMetaErrorCodeToOutcome(error.code)
              : "callFailed",
        }
      }

      // From this point Meta is already ringing the customer (`connectCall`
      // succeeded). If any of the following writes throws, the customer's
      // phone keeps ringing while the client is told the dial failed and our
      // own state never advances past `pending` — compensate by best-effort
      // terminating the call at Meta and finalizing the DB row as failed,
      // then return a typed `callFailed` rather than letting the error
      // surface raw.
      //
      // Order matters for a hangup racing this dial. The call control is
      // created BEFORE the row carries the wacid, so a hangup that can see
      // the wacid always finds a control to end. A hangup that lands while
      // the row still has no wacid closes the row instead — detected below
      // from the bound row, and never dialed.
      const deadlineAt = Date.now() + OUTBOUND_DIAL_DEADLINE_MS
      try {
        await whatsappVoipCallService.startOutboundDial({
          wacid,
          initiatorUserId: ctx.user.id,
          deadlineAt,
        })
        const boundCall = await whatsappVoipCallService.attachMetaCallId({
          whatsappCallId: pending.id,
          wacid,
        })
        if (!boundCall || whatsappVoipCallService.isCallEnded(boundCall)) {
          await abandonOutboundDial({ auth, wacid, attemptId })
          logger.info(
            { whatsappCallId: pending.id, wacid, attemptId },
            "WhatsApp outbound dial: ended before Meta connected; hung up the connected leg",
          )
          // The canceller already reported the cancel; the initiating tab maps
          // any non-dialing outcome of a cancelled attempt to "cancelled".
          return { outcome: "callFailed" }
        }
        await whatsappVoipSignalingService.enqueueOutboundDialExpiry({
          attemptId,
          whatsappCallId: pending.id,
          wacid,
          workspaceId,
          deadlineAt,
        })
      } catch (error) {
        logger.error(
          { err: error, whatsappCallId: pending.id, wacid, attemptId },
          "WhatsApp outbound dial: post-connect setup failed after Meta connect succeeded; compensating",
        )
        await abandonOutboundDial({ auth, wacid, attemptId })
        await whatsappVoipCallService
          .finalizeEndedCall({
            whatsappCallId: pending.id,
            status: "failed",
            endedAt: new Date(),
            lastError: "outbound-setup-failed",
          })
          .catch((finalizeError: unknown) => {
            logger.error(
              { err: finalizeError, whatsappCallId: pending.id, attemptId },
              "WhatsApp outbound dial: failed to finalize pending row after post-connect failure",
            )
          })
        return { outcome: "callFailed" }
      }

      const browserRecordingEnabled =
        integration.callRecordingEnabled &&
        integration.callRecordingMode === "browserWhisper"
      const recordingRequested =
        (announcementApplied && announcementOptions.recording !== undefined) ||
        browserRecordingEnabled
      await recordCallRecordingArrangement({
        whatsappCallId: pending.id,
        workspaceId,
        recordingRequested,
        recordingWasRequested: announcementOptions.recording !== undefined,
        transcriptionWasRequested:
          announcementOptions.transcription !== undefined,
        announcementLanguage:
          announcementOptions.recording?.announcementLanguage,
        purposeChars: announcementOptions.recording?.purpose.length,
        browserRecordingEnabled,
        announcementError,
      })

      return {
        outcome: "dialing",
        whatsappCallId: pending.id,
        wacid,
        attemptId,
        deadlineAt: new Date(deadlineAt).toISOString(),
        browserRecordingEnabled,
        recordingRequested,
      }
    },
  )
