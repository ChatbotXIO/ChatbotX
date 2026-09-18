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

/** Mirrors `MAX_SDP_OFFER_CHARS` in `integrations/whatsapp/src/lib/calls.ts` — bounds the answer SDP the browser posts back. */
const MAX_SDP_ANSWER_CHARS = 100_000

const answerVoipCallSchema = z.object({
  whatsappCallId: zodBigintAsString(),
  sdpAnswer: z.string().min(1).max(MAX_SDP_ANSWER_CHARS),
})

/**
 * Discriminated outcome instead of throwing for the two expected
 * non-error races (see `docs/whatsapp-calling-voip.md`): a losing
 * `claimForAnswer` (another agent answered first, or the reservation
 * expired) and a losing `commitAccepted` (a terminate/expiry advanced the
 * call's phase before this accept could commit). Both are normal outcomes
 * of a real-time race, not application errors — the dock UI branches on
 * `outcome` rather than parsing an error string.
 */
export type AnswerWhatsappVoipCallResult =
  | {
      outcome: "accepted"
      /**
       * True only when the BROWSER MediaRecorder should capture this call —
       * `callRecordingEnabled && callRecordingMode === "browserWhisper"`.
       * Under the default `metaNative` mode, Meta records the call
       * server-side and the browser must never also record it.
       */
      browserRecordingEnabled: boolean
      /**
       * True when recording was requested in ANY form — either Meta-native
       * (a `recording` announcement object was attached to `accept`) or
       * browser-side (`browserRecordingEnabled`). Purely a display signal for
       * the call panel's "recording requested" indicator.
       */
      recordingRequested: boolean
    }
  | { outcome: "cannotAnswer" }
  | { outcome: "callEnded" }

/**
 * Best-effort contact-locale lookup for the announcement-language fallback
 * (`buildCallAnnouncementOptions`) — only consulted when the integration
 * has not configured `callAnnouncementLanguage`. An unresolvable contact
 * degrades to Meta's `en_US` default via `resolveAnnouncementLanguage`;
 * it never blocks answering the call.
 *
 * Prefers the per-channel `ContactInbox.language` — the value the "Language"
 * field in the contact panel actually writes (contact-detail.tsx) — over the
 * contact-level `Contact.locale`, which is auto-derived from the WhatsApp
 * profile. Reading only `Contact.locale` made an agent's explicit English
 * choice have no effect on the spoken announcement (it stayed the profile's
 * Vietnamese).
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
 * Resolves the workspace-scoped call row + its WhatsApp auth. Never trusts
 * client input beyond the DB id — wacid, phoneNumberId, and credentials are
 * all derived server-side from it (`docs/whatsapp-calling-voip.md`
 * "Identifier discipline"). `browserRecordingEnabled` is true only when
 * recording is on AND `callRecordingMode === "browserWhisper"` — under the
 * default `metaNative` mode Meta records server-side, so the browser
 * MediaRecorder must never also start. `announcementOptions`
 * is the Meta-native `recording`/`transcription` opt-in (see
 * {@link buildCallAnnouncementOptions}) — empty in `browserWhisper` mode or
 * when both toggles are off.
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
 * Wraps {@link acceptCall} with the announcement-options safeguard: on a 4xx
 * specific to these fields, retry once with the object omitted rather than
 * failing the call — mirrors `connectCallWithAnnouncementFallback` in
 * `initiate-outbound-voip-call.action.ts`.
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
    // Surfaced by the caller: the call is connected but NOT being recorded.
    // Meta accepted the call WITHOUT recording/transcription: nothing will
    // ever be recorded for it, so the caller must not advertise one.
    return { announcementApplied: false, announcementError: error }
  }
}

/**
 * Answers an inbound WhatsApp VoIP call (browser WebRTC) as the reserved
 * agent: fenced CAS claim → Graph `pre_accept` → `accept` → fenced commit →
 * guarded DB persist. A losing claim or a losing commit are surfaced as a
 * typed outcome rather than an exception (see {@link AnswerWhatsappVoipCallResult}).
 * A commit loss compensates by telling Meta to `terminate` so the call
 * never dangles accepted on Meta's side while our own state says otherwise.
 * A Graph accept failure instead compensates by best-effort releasing the
 * fenced claim back to `reserved`, so a transient error doesn't strand the
 * call for the whole rung team until expiry. A successful accept
 * best-effort broadcasts `whatsappCallClaimedElsewhere` so every other rung
 * agent's ringing dialog clears immediately. The SDP answer is never logged.
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

      // P2 item 5 (plan D3): the same eligibility check that gates every
      // other call action — checked BEFORE the claim below so an
      // ineligible agent never occupies the claim slot for the whole rung
      // team until expiry. Reuses the `conversationId` already resolved by
      // `resolveCallAndAuth` fresh above, never a cached read.
      if (
        !(await canCallConversation({
          workspaceId,
          conversationId,
          userId: ctx.user.id,
        }))
      ) {
        return { outcome: "cannotAnswer" }
      }

      // The control's `deadlineAt` is the authoritative answer budget —
      // check it (with a safety margin) before claim/pre_accept/accept below
      // so an in-flight answer attempt never wins a race it has effectively
      // already lost to Meta's own timeout. `deadlineAt` is immutable across
      // the whole state machine (preserved through every CAS), so one read
      // here covers all three checkpoints.
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

      // L1: neutral name/message — this releases the claim for several
      // reasons (deadline expiry, a losing D3 eligibility re-check,
      // pre_accept racing the deadline), not only expiry.
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

      // P2 item 5 (plan D3): re-checked AFTER the claim succeeded, before
      // `pre_accept` — a fresh reload catches a reassignment or a removal
      // that happened in the window between the first check above and this
      // agent winning the claim. Releases the claim on failure so a losing
      // eligibility race never strands the call for the whole rung team.
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
      // Whether the browser actually obtained a TURN relay address is the
      // single most useful fact when a call connects and stays silent, and it
      // is knowable only from the answer SDP. Counts only — no SDP content.
      // Two independent causes of a silent call, both invisible without this.
      // One constant message with the diagnosis as a field, so the log backend
      // can group and alert on it; the unhealthy cases are warnings.
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
          // Never call `accept` past the deadline — Meta would reject it
          // anyway, and the answer window has already closed.
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
          // Map a Graph accept failure that raced past the deadline to the
          // same "cannotAnswer" outcome the pre-checks return, rather than
          // surfacing it as a generic accept failure.
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
        // Best-effort: return the control to `reserved`/`reservedUserId:""`
        // so a transient Meta failure doesn't strand the call `answering`
        // (reserved by this agent) for the whole rung team until expiry —
        // other rung agents, and this agent after an F5, can still answer
        // within the original deadline. Never let a release failure mask
        // the original Graph error.
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
        // A terminate/expiry advanced the call's phase before this accept
        // could commit — compensate so Meta's side ends too, and never
        // persist an "accepted" row for a call our own state already
        // considers over.
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
        // finalized it between our Redis commit and this write), so the call
        // is over even though we just accepted it with Meta. Compensate the
        // same way as a lost commit: tell Meta to terminate and report the
        // call as ended rather than persisting an "accepted" the row rejected.
        await terminateCall({ auth, callId: wacid }).catch((error: unknown) => {
          logger.error(
            { err: error, whatsappCallId, wacid },
            "WhatsApp VoIP compensating terminate failed",
          )
        })
        return { outcome: "callEnded" }
      }

      // Best-effort: tell every other rung agent's dialog to stop ringing
      // immediately rather than waiting out the answer deadline. The winning
      // agent's own client ignores this event via `answeredByUserId`. A
      // broadcast failure must never fail the accept the agent already won.
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

      // Best-effort auto-assign (P3): last step, after every other
      // best-effort side effect (the claimed-elsewhere broadcast and the
      // recording bookkeeping above) so it never delays the P1
      // `whatsappCallClaimedElsewhere` broadcast that tells other rung
      // agents to stop ringing. Awaited so it completes before the action
      // returns, but errors are caught and logged inside
      // `claimConversationForCallAgent` — never allowed to change the
      // outcome. Skipped for a support session (D8, plan §5 P3).
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
