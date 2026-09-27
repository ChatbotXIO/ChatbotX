"use server"

import {
  broadcastToWorkspaceParty,
  canCallConversation,
  canSendAudio,
  contactInboxService,
  contactService,
  diagnoseAnswerShape,
  isAnswerDeadlineExpired,
  summarizeIceCandidates,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  acceptCall,
  preAcceptCall,
  terminateCall,
  type WhatsappCallAnnouncementOptions,
  type WhatsappCallSdpAnswerInput,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { logger } from "@/lib/log"
import { callingActionClient } from "@/lib/safe-action"
import {
  buildCallAnnouncementOptions,
  hasCallAnnouncementOptions,
  isCallAnnouncementValidationError,
} from "./call-announcement-options"
import { claimConversationForCallAgent } from "./claim-conversation-for-call-agent"
import { recordCallRecordingArrangement } from "./record-call-recording-arrangement"

/**
 * Mirrors MAX_SDP_OFFER_CHARS in integrations/whatsapp/src/lib/calls.ts -
 * bounds the answer SDP the browser posts back.
 */
const MAX_SDP_ANSWER_CHARS = 100_000

const answerVoipCallSchema = z.object({
  whatsappCallId: zodBigintAsString(),
  sdpAnswer: z.string().min(1).max(MAX_SDP_ANSWER_CHARS),
})

/**
 * Discriminated outcome instead of throwing for two expected races: a losing
 * claimForAnswer (another agent answered first, or the reservation expired) and
 * a losing commitAccepted (a terminate/expiry advanced the call's phase first).
 * Both are normal race outcomes, not errors.
 */
export type AnswerWhatsappVoipCallResult =
  | {
      outcome: "accepted"
      /**
       * True only when the browser MediaRecorder should capture the call. Under
       * the default metaNative mode Meta records server-side and the browser
       * must never also record.
       */
      browserRecordingEnabled: boolean
      /**
       * True when recording was requested in any form (Meta-native or browser-
       * side) - a display signal only.
       */
      recordingRequested: boolean
    }
  | { outcome: "cannotAnswer" }
  | { outcome: "callEnded" }

/**
 * Fallback when the integration has no callAnnouncementLanguage set; an
 * unresolvable contact falls back to Meta's en_US default. Prefers
 * ContactInbox.language (agent's explicit choice) over Contact.locale
 * (auto-derived from the WhatsApp profile).
 */
async function resolveContactLocale(
  contactInboxId: string,
): Promise<string | undefined> {
  const contactInbox = await contactInboxService.findBy({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    return
  }
  if (contactInbox.language) {
    return contactInbox.language
  }
  const contact = await contactService.findBy({
    where: { id: contactInbox.contactId },
  })
  return contact?.locale ?? undefined
}

/**
 * wacid, phoneNumberId, and credentials are derived server-side from the DB
 * id, never trusted from client input. browserRecordingEnabled is true only
 * under callRecordingMode === browserWhisper; otherwise Meta records
 * server-side and announcementOptions carries the recording/transcription
 * opt-in instead.
 */
async function resolveCallAndAuth(input: {
  whatsappCallId: string
  workspaceId: string
}): Promise<{
  wacid: string
  conversationId: string
  auth: WhatsappAuthValue
  browserRecordingEnabled: boolean
  announcementOptions: WhatsappCallAnnouncementOptions
}> {
  const t = await getTranslations()
  const call = await whatsappCallRepository.findById(input.whatsappCallId)
  if (!call || call.workspaceId !== input.workspaceId || !call.wacid) {
    throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
  }

  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      workspaceId: input.workspaceId,
      inboxId: call.inboxId,
    })
  if (!integration) {
    throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
  }

  const contactLocale = await resolveContactLocale(call.contactInboxId)
  const announcementOptions = buildCallAnnouncementOptions(
    integration,
    contactLocale,
  )

  return {
    wacid: call.wacid,
    conversationId: call.conversationId,
    auth: integration.auth as WhatsappAuthValue,
    browserRecordingEnabled:
      integration.callRecordingEnabled &&
      integration.callRecordingMode === "browserWhisper",
    announcementOptions,
  }
}

/**
 * Wraps acceptCall with the announcement-options safeguard: on a 4xx specific
 * to these fields, retry once with the object omitted rather than failing the
 * call - mirrors connectCallWithAnnouncementFallback in initiate-outbound-voip-
 * call.action.ts.
 */
async function acceptCallWithAnnouncementFallback(
  input: WhatsappCallSdpAnswerInput & WhatsappCallAnnouncementOptions,
): Promise<{ announcementApplied: boolean; announcementError?: unknown }> {
  const announcementAttached = hasCallAnnouncementOptions({
    recording: input.recording,
    transcription: input.transcription,
  })
  try {
    await acceptCall(input)
    return { announcementApplied: announcementAttached }
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
      { err: error, whatsappCallId: input.callId },
      "WhatsApp VoIP accept: retrying without recording/transcription announcement options after a Meta 4xx",
    )
    await acceptCall(withoutAnnouncementOptions)
    // Surfaced by the caller: the call connected but Meta accepted it without
    // recording/transcription, so nothing will ever be recorded - the caller
    // must not advertise one.
    return { announcementApplied: false, announcementError: error }
  }
}

/**
 * Answers an inbound WhatsApp VoIP call as the reserved agent: fenced CAS
 * claim, Graph pre_accept, accept, fenced commit, guarded DB persist. A
 * losing claim/commit is a typed outcome, not a throw. A commit loss
 * compensates with a Meta terminate so Meta's side never stays accepted
 * while our state disagrees; an accept failure instead releases the claim
 * so a transient error doesn't strand the call until expiry.
 */
export const answerWhatsappVoipCallAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(answerVoipCallSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }): Promise<AnswerWhatsappVoipCallResult> => {
      const t = await getTranslations()
      const { whatsappCallId, sdpAnswer } = parsedInput
      const {
        wacid,
        conversationId,
        auth,
        browserRecordingEnabled,
        announcementOptions,
      } = await resolveCallAndAuth({
        whatsappCallId,
        workspaceId,
      })

      // The same eligibility check that gates every other call action, checked
      // before the claim below so an ineligible agent never occupies the claim
      // slot until expiry. Reuses the conversationId resolved fresh above,
      // never a cached read.
      if (
        !(await canCallConversation({
          workspaceId,
          conversationId,
          userId: ctx.user.id,
        }))
      ) {
        return { outcome: "cannotAnswer" }
      }

      // The control's deadlineAt is the authoritative answer budget - checked
      // (with a safety margin) before claim/pre_accept/accept so an in-flight
      // attempt never wins a race it's already lost to Meta's own timeout.
      // Immutable across the state machine, so one read here covers all three
      // checkpoints.
      const control = await whatsappVoipCallService.readControl(wacid)
      if (!control || isAnswerDeadlineExpired(control.deadlineAt)) {
        return { outcome: "cannotAnswer" }
      }

      const fenceToken = await whatsappVoipCallService.claimForAnswer({
        wacid,
        userId: ctx.user.id,
      })
      if (!fenceToken) {
        return { outcome: "cannotAnswer" }
      }

      // Neutral name/message - this releases the claim for several reasons
      // (deadline expiry, a losing eligibility re-check, pre_accept racing the
      // deadline), not only expiry.
      const releaseClaimBestEffort = (): Promise<void> =>
        whatsappVoipCallService
          .releaseClaim({ wacid, fenceToken })
          .then(() => undefined)
          .catch((releaseError: unknown) => {
            logger.warn(
              { err: releaseError, whatsappCallId, wacid },
              "WhatsApp VoIP call: best-effort releaseClaim failed",
            )
          })

      if (isAnswerDeadlineExpired(control.deadlineAt)) {
        await releaseClaimBestEffort()
        return { outcome: "cannotAnswer" }
      }

      // Re-checked after the claim succeeded, before pre_accept - a fresh
      // reload catches a reassignment or removal that happened between the
      // first check and winning the claim. Releases the claim on failure so a
      // losing eligibility race never strands the call.
      if (
        !(await canCallConversation({
          workspaceId,
          conversationId,
          userId: ctx.user.id,
        }))
      ) {
        await releaseClaimBestEffort()
        return { outcome: "cannotAnswer" }
      }

      let announcementApplied = false
      let announcementError: unknown
      // Whether the browser obtained a TURN relay address is the most useful
      // fact when a call connects and stays silent, and it's only knowable from
      // the answer SDP. Counts only, no SDP content. One constant message with
      // the diagnosis as a field so the log backend can group/alert; unhealthy
      // cases are warnings.
      const answerShape = summarizeIceCandidates(sdpAnswer)
      const diagnosis = diagnoseAnswerShape(answerShape)
      const logCallMedia =
        diagnosis === "healthy"
          ? logger.info.bind(logger)
          : logger.warn.bind(logger)
      logCallMedia(
        {
          whatsappCallId,
          workspaceId,
          ...answerShape,
          diagnosis,
          turnRelayUsed: answerShape.relay > 0,
          canSendAudio: canSendAudio(answerShape),
        },
        "[wa-call-media] answer media path",
      )

      try {
        await preAcceptCall({ auth, callId: wacid, sdpAnswer })
        if (isAnswerDeadlineExpired(control.deadlineAt)) {
          // Never call accept past the deadline - Meta would reject it anyway.
          await releaseClaimBestEffort()
          return { outcome: "cannotAnswer" }
        }
        ;({ announcementApplied, announcementError } =
          await acceptCallWithAnnouncementFallback({
            auth,
            callId: wacid,
            sdpAnswer,
            ...announcementOptions,
          }))
      } catch (error) {
        if (isAnswerDeadlineExpired(control.deadlineAt)) {
          // Map a Graph accept failure that raced past the deadline to the same
          // cannotAnswer outcome the pre-checks return, rather than a generic
          // accept failure.
          logger.warn(
            { err: error, whatsappCallId, wacid },
            "WhatsApp VoIP call accept failed after the answer deadline",
          )
          await releaseClaimBestEffort()
          return { outcome: "cannotAnswer" }
        }
        logger.error(
          { err: error, whatsappCallId, wacid },
          "WhatsApp VoIP call accept failed",
        )
        // Best-effort: return the control to reserved so a transient Meta
        // failure doesn't strand the call for the whole rung team until expiry
        // - other agents, and this agent on retry, can still answer within the
        // deadline. Never let a release failure mask the original error.
        await whatsappVoipCallService
          .releaseClaim({ wacid, fenceToken })
          .catch((releaseError: unknown) => {
            logger.warn(
              { err: releaseError, whatsappCallId, wacid },
              "WhatsApp VoIP call: releaseClaim after accept failure failed",
            )
          })
        throw new ChatbotXException(t("whatsapp.calls.errors.voipAnswerFailed"))
      }

      const committed = await whatsappVoipCallService.commitAccepted({
        wacid,
        fenceToken,
      })
      if (!committed) {
        // A terminate/expiry advanced the call's phase before this accept could
        // commit - compensate so Meta's side ends too, and never persist an
        // accepted row for a call our state already considers over.
        await terminateCall({ auth, callId: wacid }).catch((error: unknown) => {
          logger.error(
            { err: error, whatsappCallId, wacid },
            "WhatsApp VoIP compensating terminate failed",
          )
        })
        return { outcome: "callEnded" }
      }

      const accepted = await whatsappVoipCallService.markAcceptedByAgent({
        whatsappCallId,
        agentUserId: ctx.user.id,
      })
      if (!accepted) {
        // The DB row was already terminal (a concurrent hangup/terminate
        // finalized it between commit and this write). Compensate the same way
        // as a lost commit: terminate on Meta's side and report the call as
        // ended.
        await terminateCall({ auth, callId: wacid }).catch((error: unknown) => {
          logger.error(
            { err: error, whatsappCallId, wacid },
            "WhatsApp VoIP compensating terminate failed",
          )
        })
        return { outcome: "callEnded" }
      }

      // Best-effort: tell every other ringing dialog - other agents' and this
      // agent's other tabs - to stop immediately rather than waiting out the
      // deadline. The tab that answered ignores it because it is already past
      // incomingRinging. A broadcast failure must never fail the accept
      // already won.
      await broadcastToWorkspaceParty(workspaceId, {
        eventType: RealtimeEventType.whatsappCallClaimedElsewhere,
        data: {
          whatsappCallId,
          wacid,
          answeredByUserId: ctx.user.id,
        },
      }).catch((error: unknown) => {
        logger.warn(
          { err: error, whatsappCallId, wacid },
          "WhatsApp VoIP call: whatsappCallClaimedElsewhere broadcast failed",
        )
      })

      const recordingRequested =
        (announcementApplied && announcementOptions.recording !== undefined) ||
        browserRecordingEnabled
      await recordCallRecordingArrangement({
        whatsappCallId,
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

      // Best-effort auto-assign: last step, after the other best-effort side
      // effects, so it never delays the claimed-elsewhere broadcast. Awaited
      // but errors are caught/logged inside claimConversationForCallAgent,
      // never allowed to change the outcome. Skipped for a support session.
      await claimConversationForCallAgent({
        workspaceId,
        conversationId,
        agentUserId: ctx.user.id,
        whatsappCallId,
        trigger: "answered",
        isSupportSession: ctx.isSupportSession,
      })

      return {
        outcome: "accepted",
        browserRecordingEnabled,
        recordingRequested,
      }
    },
  )
