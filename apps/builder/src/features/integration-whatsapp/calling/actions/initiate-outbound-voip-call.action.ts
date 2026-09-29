"use server"

import {
  canCallConversation,
  contactService,
  conversationService,
  WhatsappCallInProgressError,
  whatsappVoipCallService,
  whatsappVoipSignalingService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  channelTypes,
  resolveWhatsappCallOutcome,
} from "@chatbotx.io/database/partials"
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
import { callingActionClient } from "@/lib/safe-action"
import { BLOCKED_OUTBOUND_COUNTRIES } from "./blocked-outbound-countries"
import {
  buildCallAnnouncementOptions,
  hasCallAnnouncementOptions,
  isCallAnnouncementValidationError,
} from "./call-announcement-options"
import { claimConversationForCallAgent } from "./claim-conversation-for-call-agent"
import {
  isBlockedBusinessCallingCountry,
  resolveContactInbox,
  resolveDialIdentity,
} from "./outbound-dial-target"
import { recordCallRecordingArrangement } from "./record-call-recording-arrangement"

/** Same SDP size bound the inbound answer path applies. */
const MAX_SDP_OFFER_CHARS = 100_000

/**
 * How long the consumer has to accept before the dial is abandoned — kept
 * strictly under the 90s stale-call sweeper so it can never finalize a still-
 * ringing dial.
 * Not exported: a "use server" file may only export async functions, and this
 * constant is only used within this module.
 */
const OUTBOUND_DIAL_DEADLINE_MS = 60_000

const initiateOutboundVoipCallSchema = z.object({
  conversationId: zodBigintAsString(),
  /**
   * Optional pin to a specific WhatsApp number when the contact has more than
   * one connected ContactInbox row — mirrors requestCallPermissionAction's
   * optional inboxId.
   */
  contactInboxId: zodBigintAsString().optional(),
  sdpOffer: z.string().min(1).max(MAX_SDP_OFFER_CHARS),
})

/**
 * Discriminated outcome for the outbound VoIP dial attempt. dialing is the only
 * success case; every other member is an expected eligibility/permission/Meta-
 * error outcome the client branches on directly. The SDP answer itself arrives
 * later via the whatsappCallOutboundAnswer realtime event.
 */
export type InitiateOutboundVoipCallResult =
  | {
      outcome: "dialing"
      whatsappCallId: string
      wacid: string
      attemptId: string
      deadlineAt: string
      /**
       * True only when the browser MediaRecorder should capture this call.
       * Under the default metaNative mode, Meta records server-side and the
       * browser must never also record.
       */
      browserRecordingEnabled: boolean
      /**
       * True when recording was requested in any form (Meta-native or browser-
       * side) — purely a display signal for the call panel; it does not itself
       * start capture.
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
   * The caller failed the same call-access-conversation eligibility check every
   * other calling action gates on — an assigned-only agent dialing someone
   * else's conversation. A typed outcome rather than a thrown exception so the
   * client can show the actual translated reason instead of a generic toast.
   */
  | { outcome: "callAccessDenied" }

/**
 * Best-effort teardown of a leg Meta already connected but this dial will not
 * keep: ends local call control (if created) and hangs up at Meta. Never throws
 * — each failure is logged, and Meta also drops an unanswered leg on its own
 * timeout.
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
 * Wraps connectCall with the announcement-options safeguard: on a 4xx specific
 * to these fields, retry once with the object omitted rather than failing the
 * call. Meta documents no error code for a bad purpose/announcement_language,
 * so a 4xx qualifies only when it isn't one of Meta's documented calling errors
 * and announcement options were actually attached.
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
    // Meta placed the call without recording/transcription: nothing will ever
    // be recorded, so the caller must not advertise one.
    return {
      ...connected,
      announcementApplied: false,
      announcementError: error,
    }
  }
}

/**
 * Maps a Meta calling error code to the typed outcome the client renders. Codes
 * that only make sense for other call actions (e.g. 138007 connect timeout,
 * media-drop codes) fall through to the generic callFailed.
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
 * Unlike answerWhatsappVoipCallAction, this calls the Graph client directly
 * since the browser already built the SDP offer — no async webhook round-trip
 * before Meta's connect response. Eligibility/permission/glare outcomes are
 * typed rather than thrown, since the client renders each branch directly.
 */
export const initiateOutboundVoipCallAction = callingActionClient
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

      // Dialing is gated exactly like picking up an inbound call — an assigned-
      // only agent must not dial another agent's conversation. Checked before
      // any Meta call or createOutboundAttempt. Non-throwing so a denial is a
      // typed outcome rather than a generic serverError toast.
      if (
        !(await canCallConversation({
          workspaceId,
          conversationId,
          userId: ctx.user.id,
        }))
      ) {
        return { outcome: "callAccessDenied" }
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

      // Business-number country block. Fails open on an unparsable number —
      // Meta's 138013 is the backstop.
      // calling.status, the calls-webhook subscription and restrictions_list
      // are further Meta-side signals, backstopped by error codes
      // 138013/138018/138014 — not checked here since the resolved integration
      // row does not carry them.
      if (
        isBlockedBusinessCallingCountry(
          integration.displayPhoneNumber,
          BLOCKED_OUTBOUND_COUNTRIES,
        )
      ) {
        return { outcome: "ineligibleNumber" }
      }

      // Addressing (phone number vs BSUID) mirrors the outbound message path,
      // and the permissions GET takes the same shape.
      const { to, recipient, permissionTarget } =
        resolveDialIdentity(resolvedContactInbox)
      const useRecipient = recipient !== undefined
      const auth = integration.auth as WhatsappAuthValue

      // Best-effort: the contact's locale only feeds the announcement language
      // fallback when the integration has no callAnnouncementLanguage
      // configured — a missing/unfetchable contact degrades to Meta's en_US
      // default, never blocks the dial. Prefer ContactInbox.language over the
      // auto-derived Contact.locale, so an explicit language choice actually
      // changes the spoken announcement.
      const contact = await contactService.findBy({
        where: { id: conversation.contactId },
      })
      const announcementOptions = buildCallAnnouncementOptions(
        integration,
        resolvedContactInbox.language ?? contact?.locale ?? undefined,
      )

      // A failing permissions GET (Meta 5xx / 613 rate-limit) is not the same
      // as a successful GET reporting no permission — treating it as
      // needsPermission would burn the contact's 1-per-24h permission-request
      // quota on a check that never ran. Fail closed without spending that
      // quota.
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
      // assertNoActiveCallForContact above is read-then-write: two simultaneous
      // dials can both pass and race here. The loser hits the DB's one-pending-
      // per-contact-inbox unique index and throws
      // WhatsappCallPendingOutboundExistsError — map that to the same typed
      // outcome as the glare guard rather than a generic server error.
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
          // Exactly one of to/recipient per WhatsappConnectCallInput.
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
            outcome: resolveWhatsappCallOutcome({ status: "failed" }),
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

      // Meta is already ringing the customer; a write failure from here is
      // compensated by best-effort terminate + finalize-as-failed. Call
      // control is created before the row carries the wacid, so a hangup
      // racing this dial always finds either a control to end or a row with
      // no wacid to close.
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
            outcome: resolveWhatsappCallOutcome({ status: "failed" }),
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

      // Best-effort auto-assign: last step, after every other best-effort side
      // effect, so it never delays the customer-facing dial. Awaited so it
      // completes before return, but errors are caught and logged inside
      // claimConversationForCallAgent — never allowed to change the dial's
      // outcome. Skipped for a support session.
      await claimConversationForCallAgent({
        workspaceId,
        conversationId: conversation.id,
        agentUserId: ctx.user.id,
        whatsappCallId: pending.id,
        trigger: "dialed",
        isSupportSession: ctx.isSupportSession,
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
