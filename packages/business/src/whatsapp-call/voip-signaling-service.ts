import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { casStore } from "@chatbotx.io/redis"
import {
  enqueueIntegrationJob,
  expireOutboundDialJobId,
  IntegrationJobAction,
  outboundAnswerJobId,
  WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
  WhatsappVoipSignalingJobAction,
  whatsappCallNativeRecordingFetchJobId,
  whatsappCallNativeTranscriptFetchJobId,
  whatsappVoipExpiryJobId,
  whatsappVoipSignalingJobId,
  whatsappVoipSignalingQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import {
  offerKey,
  outboundAnswerKey,
  remainingTtlMs,
  VOIP_ANSWER_DEADLINE_MS,
  type VoipOfferRecord,
  type VoipOutboundAnswerRecord,
} from "./voip-call-control"
import { pinAnswerDtlsSetup } from "./voip-sdp"

export type StoreOfferInput = {
  wacid: string
  sdp: string
  deadlineAt: number
}

export type CaptureConnectOfferInput = {
  wacid: string
  sdp: string
  /** Resolves the integration (workspace/inbox/Graph auth) in the signaling consumer. */
  phoneNumberId: string
  /**
   * Epoch ms the call arrived, from Meta's webhook timestamp — passed in rather
   * than read here so it stays stable across a redelivery (call hours must be
   * evaluated against when the customer actually rang, not when a retry ran).
   */
  receivedAt?: number
}

export type StoreOutboundAnswerInput = {
  attemptId: string
  sdp: string
}

/**
 * Webhook entry point for a BUSINESS_INITIATED connect event's answer.
 * attemptId is Meta's echoed biz_opaque_callback_data; callers pass "" when
 * absent and rely on the wacid fallback in captureOutboundAnswer.
 */
export type CaptureOutboundAnswerInput = {
  attemptId: string
  wacid: string
  sdp: string
}

/**
 * Webhook entry point for a Meta-native call_recording_available event.
 * Identifiers/URL only, never the audio bytes.
 */
export type CaptureNativeRecordingAvailableInput = {
  wacid: string
  /** Graph Media API id for the recording audio. */
  audioMediaId: string
  /** Meta's short-lived (~5-min) download URL. */
  audioUrl: string
  /** e.g. audio/ogg; codecs=opus. */
  mimeType: string
}

/**
 * Webhook entry point for a Meta-native call_transcription_available event.
 * Identifiers/URL only, never the transcript bytes.
 */
export type CaptureNativeTranscriptAvailableInput = {
  wacid: string
  /** Graph Media API id for the transcript document. */
  documentMediaId: string
  /** Meta's short-lived download URL. */
  documentUrl: string
}

export type EnqueueOutboundDialExpiryInput = {
  attemptId: string
  whatsappCallId: string
  wacid: string
  workspaceId: string
  /** Epoch ms — Meta's user-accept deadline for this outbound dial. */
  deadlineAt: number
}

/**
 * Webhook- and queue-facing side of VoIP calling: stores SDP records and hands
 * events to the signaling worker. Split from whatsappVoipCallService (owns the
 * call-control state machine) to keep webhook entry points small and testable.
 */
class WhatsappVoipSignalingService {
  /**
   * Immutable first-seen SDP offer store: SET NX PX=(deadlineAt-now), so a
   * redelivered connect webhook can't overwrite the offer or extend its TTL.
   * Returns whether THIS call created the record (false means a redelivery).
   */
  async storeOffer(input: StoreOfferInput): Promise<boolean> {
    const record: VoipOfferRecord = {
      sdp: input.sdp,
      deadlineAt: input.deadlineAt,
    }
    return await casStore.setIfAbsent(
      offerKey(input.wacid),
      record,
      remainingTtlMs(input.deadlineAt),
    )
  }

  /**
   * Writes the offer to short-TTL Redis, then enqueues both handleConnect and
   * expireIfUnanswered — SDP never reaches either job. Scheduling expiry here
   * (not at the end of handleConnect) decouples the deadline from that
   * consumer succeeding. Deterministic jobIds make redelivery a dedup no-op.
   */
  async captureConnectOffer(input: CaptureConnectOfferInput): Promise<void> {
    const deadlineAt = Date.now() + VOIP_ANSWER_DEADLINE_MS
    const created = await this.storeOffer({
      wacid: input.wacid,
      sdp: input.sdp,
      deadlineAt,
    })
    if (!created) {
      // Redelivered connect webhook within the offer's TTL: the first
      // offer/deadline stand and a signaling job is already in flight. Re-
      // enqueuing would re-ring the agent and reset the deadline, so stop.
      return
    }
    // The offer key is claimed (SET NX) so a later redelivery early-returns and
    // won't retry the enqueue. If either enqueue throws, release the claim so
    // the next redelivery re-stores and re-enqueues cleanly.
    try {
      await this.enqueueHandleConnect(
        input.wacid,
        deadlineAt,
        input.phoneNumberId,
        input.receivedAt,
      )
      await whatsappVoipSignalingQueue.add(
        WhatsappVoipSignalingJobAction.expireIfUnanswered,
        {
          type: WhatsappVoipSignalingJobAction.expireIfUnanswered,
          data: {
            wacid: input.wacid,
            deadlineAt,
            phoneNumberId: input.phoneNumberId,
          },
        },
        {
          jobId: whatsappVoipExpiryJobId(input.wacid),
          delay: Math.max(deadlineAt - Date.now(), 0),
          ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
        },
      )
    } catch (error) {
      await this.deleteOffer(input.wacid)
      throw error
    }
  }

  /**
   * Malformed/oversized inline SDP: enqueue the signaling job without storing
   * an offer, so the consumer reads none and Meta-rejects the call. No expiry
   * job — nothing to wait for.
   */
  async rejectUnprocessableConnect(input: {
    wacid: string
    phoneNumberId: string
    receivedAt?: number
  }): Promise<void> {
    await this.enqueueHandleConnect(
      input.wacid,
      Date.now() + VOIP_ANSWER_DEADLINE_MS,
      input.phoneNumberId,
      input.receivedAt,
    )
  }

  /**
   * Enqueues the slim (SDP-free) handleConnect job, replay-safe by
   * deterministic id.
   */
  private async enqueueHandleConnect(
    wacid: string,
    deadlineAt: number,
    phoneNumberId: string,
    receivedAt?: number,
  ): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.handleConnect,
      {
        type: WhatsappVoipSignalingJobAction.handleConnect,
        // The moment the call arrived, not the moment the consumer runs —
        // evaluated against the number's call hours. Meta's webhook timestamp
        // when known (stable across redeliveries), the clock as fallback.
        data: {
          wacid,
          deadlineAt,
          phoneNumberId,
          receivedAt: receivedAt ?? Date.now(),
        },
      },
      {
        jobId: whatsappVoipSignalingJobId(wacid),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }

  async readOffer(wacid: string): Promise<VoipOfferRecord | null> {
    return await casStore.getJson<VoipOfferRecord>(offerKey(wacid))
  }

  async deleteOffer(wacid: string): Promise<void> {
    await casStore.del(offerKey(wacid))
  }

  /**
   * Immutable first-seen SDP answer store for an outbound call, keyed by
   * attemptId (the only id known before Meta returns a wacid) — answer-
   * direction counterpart of storeOffer. Returns whether THIS call created the
   * record.
   */
  async storeOutboundAnswer(input: StoreOutboundAnswerInput): Promise<boolean> {
    const record: VoipOutboundAnswerRecord = { sdp: input.sdp }
    return await casStore.setIfAbsent(
      outboundAnswerKey(input.attemptId),
      record,
      VOIP_ANSWER_DEADLINE_MS,
    )
  }

  async readOutboundAnswer(attemptId: string): Promise<{ sdp: string } | null> {
    return await casStore.getJson<VoipOutboundAnswerRecord>(
      outboundAnswerKey(attemptId),
    )
  }

  async deleteOutboundAnswer(attemptId: string): Promise<void> {
    await casStore.del(outboundAnswerKey(attemptId))
  }

  /**
   * Webhook entry point for a BUSINESS_INITIATED connect answer: resolves the
   * pending WhatsappCall row (created pre-dial, always exists by now), stores
   * the SDP in short-TTL Redis, then enqueues the slim handleOutboundAnswer job
   * with a deterministic jobId. Never throws into the webhook — an unresolvable
   * row is logged and dropped.
   */
  async captureOutboundAnswer(
    input: CaptureOutboundAnswerInput,
  ): Promise<void> {
    const row = input.attemptId
      ? await whatsappCallRepository.findByAttemptId(input.attemptId)
      : undefined
    const resolved =
      row ?? (await whatsappCallRepository.findByWacid(input.wacid))
    if (!resolved) {
      logger.warn(
        { attemptId: input.attemptId, wacid: input.wacid },
        "Whatsapp outbound answer: no matching call row found; dropping",
      )
      return
    }

    // The row's own attemptId (minted at dial time, echoed to Meta) is
    // authoritative over the caller's input, which may be "" on the wacid-
    // fallback path.
    const attemptId = resolved.attemptId || input.attemptId
    if (!attemptId) {
      logger.warn(
        { wacid: input.wacid, whatsappCallId: resolved.id },
        "Whatsapp outbound answer: resolved call row has no attemptId; cannot store/enqueue the answer",
      )
      return
    }

    // Normalized once here, the only place an outbound answer enters the
    // system, so every tab gets a DTLS role it can accept.
    const created = await this.storeOutboundAnswer({
      attemptId,
      sdp: pinAnswerDtlsSetup(input.sdp),
    })
    if (!created) {
      // Redelivered answer webhook for the same attemptId: the first answer
      // stands and a signaling job is already in flight.
      return
    }
    try {
      await this.enqueueHandleOutboundAnswer({
        attemptId,
        whatsappCallId: resolved.id,
        wacid: input.wacid || resolved.wacid || undefined,
        workspaceId: resolved.workspaceId,
      })
    } catch (error) {
      await this.deleteOutboundAnswer(attemptId)
      throw error
    }
  }

  /**
   * Enqueues the slim (SDP-free) handleOutboundAnswer job, replay-safe by
   * deterministic id.
   */
  private async enqueueHandleOutboundAnswer(input: {
    attemptId: string
    whatsappCallId: string
    wacid?: string
    workspaceId: string
  }): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.handleOutboundAnswer,
      {
        type: WhatsappVoipSignalingJobAction.handleOutboundAnswer,
        data: {
          attemptId: input.attemptId,
          whatsappCallId: input.whatsappCallId,
          wacid: input.wacid,
          workspaceId: input.workspaceId,
        },
      },
      {
        jobId: outboundAnswerJobId(input.attemptId),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }

  /**
   * Webhook entry point for a Meta-native call_recording_available event (VoIP-
   * only): resolves the WhatsappCall row by wacid and enqueues the slim fetch
   * job (media id/url/mime-type only). Never throws into the webhook — an
   * unresolvable row is logged and dropped.
   */
  async captureNativeRecordingAvailable(
    input: CaptureNativeRecordingAvailableInput,
  ): Promise<void> {
    const row = await whatsappCallRepository.findByWacid(input.wacid)
    if (row) {
      logger.info(
        {
          wacid: input.wacid,
          whatsappCallId: row.id,
          workspaceId: row.workspaceId,
        },
        "[wa-call-recording] matched call row → enqueuing native fetch job",
      )
    } else {
      // Never drop the event for a not-yet-created row — the recording webhook
      // can race the row-creating webhook/job. Enqueue anyway; the fetch job
      // resolves by wacid with bounded retry/backoff.
      logger.warn(
        { wacid: input.wacid },
        "[wa-call-recording] no matching call row for wacid yet; enqueuing native fetch job to retry by wacid",
      )
    }

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.whatsappCallNativeRecordingFetch,
        data: {
          ...(row === undefined
            ? {}
            : { whatsappCallId: row.id, workspaceId: row.workspaceId }),
          wacid: input.wacid,
          audioMediaId: input.audioMediaId,
          audioUrl: input.audioUrl,
          mimeType: input.mimeType,
        },
      },
      { jobId: whatsappCallNativeRecordingFetchJobId(input.wacid) },
    )
  }

  /**
   * Webhook entry point for a Meta-native call_transcription_available event
   * (VoIP-only), transcript counterpart of captureNativeRecordingAvailable.
   * Enqueues the slim fetch job (document id/url only). Never throws — no
   * matching row is logged and dropped.
   */
  async captureNativeTranscriptAvailable(
    input: CaptureNativeTranscriptAvailableInput,
  ): Promise<void> {
    const row = await whatsappCallRepository.findByWacid(input.wacid)
    if (!row) {
      // Never drop the event for a not-yet-created row — enqueue anyway; the
      // fetch job resolves by wacid with bounded retry/backoff.
      logger.warn(
        { wacid: input.wacid },
        "Whatsapp native call transcript: no matching call row found yet; enqueuing native fetch job to retry by wacid",
      )
    }

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.whatsappCallNativeTranscriptFetch,
        data: {
          ...(row === undefined
            ? {}
            : { whatsappCallId: row.id, workspaceId: row.workspaceId }),
          wacid: input.wacid,
          documentMediaId: input.documentMediaId,
          documentUrl: input.documentUrl,
        },
      },
      { jobId: whatsappCallNativeTranscriptFetchJobId(input.wacid) },
    )
  }

  /**
   * Durable deadline enforcement for the outbound dial/accept window,
   * counterpart of the expireIfUnanswered job. Called right after
   * startOutboundDial succeeds so a dial that never reaches ACCEPTED still
   * terminates on schedule.
   */
  async enqueueOutboundDialExpiry(
    input: EnqueueOutboundDialExpiryInput,
  ): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.expireOutboundDial,
      {
        type: WhatsappVoipSignalingJobAction.expireOutboundDial,
        data: {
          attemptId: input.attemptId,
          whatsappCallId: input.whatsappCallId,
          wacid: input.wacid,
          workspaceId: input.workspaceId,
          deadlineAt: input.deadlineAt,
        },
      },
      {
        jobId: expireOutboundDialJobId(input.attemptId),
        delay: Math.max(input.deadlineAt - Date.now(), 0),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }
}

export const whatsappVoipSignalingService = new WhatsappVoipSignalingService()
