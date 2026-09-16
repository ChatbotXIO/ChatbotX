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
}

export type StoreOutboundAnswerInput = {
  attemptId: string
  sdp: string
}

/**
 * The webhook-boundary entry point for a BUSINESS_INITIATED `connect` event's
 * answer. `attemptId` is Meta's echoed `biz_opaque_callback_data`
 * when present; callers pass `""` when it is absent (an older/edge payload)
 * and rely on the `wacid` fallback lookup in
 * {@link WhatsappVoipCallService.captureOutboundAnswer}.
 */
export type CaptureOutboundAnswerInput = {
  attemptId: string
  wacid: string
  sdp: string
}

/**
 * The webhook-boundary entry point for a Meta-native `call_recording_available`
 * event.
 * Mirrors {@link CaptureOutboundAnswerInput}'s shape — the identifiers/URL
 * only, never the audio bytes.
 */
export type CaptureNativeRecordingAvailableInput = {
  wacid: string
  /** Graph Media API id for the recording audio (`call_recording.audio.id`). */
  audioMediaId: string
  /** Meta's short-lived (~5-min) download URL (`call_recording.audio.url`). */
  audioUrl: string
  /** e.g. `audio/ogg; codecs=opus` (`call_recording.audio.mime_type`). */
  mimeType: string
}

/**
 * The webhook-boundary entry point for a Meta-native `call_transcription_available`
 * event.
 * Mirrors {@link CaptureOutboundAnswerInput}'s shape — the identifiers/URL
 * only, never the transcript document bytes.
 */
export type CaptureNativeTranscriptAvailableInput = {
  wacid: string
  /** Graph Media API id for the transcript document (`call_transcript.document.id`). */
  documentMediaId: string
  /** Meta's short-lived download URL (`call_transcript.document.url`). */
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
 * Webhook- and queue-facing side of VoIP calling: stores the SDP records Meta
 * delivers and hands each call event to the signaling worker. Split from
 * `whatsappVoipCallService` (which owns the call-control state machine) so the
 * webhook entry points stay small and independently testable.
 */
class WhatsappVoipSignalingService {
  /**
   * Immutable first-seen SDP offer store: `SET NX PX=(deadlineAt-now)`, so a
   * redelivered connect webhook for the same `wacid` can neither overwrite
   * the offer nor extend its TTL. Returns whether THIS call created the
   * record (`false` means a redelivery — the caller should treat the
   * existing offer as authoritative, not retry the write).
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
   * The webhook-boundary entry point for a VoIP-mode connect:
   * writes the offer to short-TTL Redis, then enqueues BOTH the slim
   * `handleConnect` signaling job AND the durable `expireIfUnanswered` job
   * — the SDP never reaches either. Scheduling the expiry here,
   * at the boundary, rather than at the end of the `handleConnect` consumer,
   * decouples deadline enforcement from that consumer succeeding: a
   * `handleConnect` that keeps failing (e.g. the call row created by the slow
   * shared queue isn't ready yet) can never leave the call without a deadline.
   * Deterministic `jobId`s make a Meta redelivery of the same connect event a
   * dedup no-op on the queue side, on top of `storeOffer`'s `SET NX`
   * immutability and the early-return above.
   */
  async captureConnectOffer(input: CaptureConnectOfferInput): Promise<void> {
    const deadlineAt = Date.now() + VOIP_ANSWER_DEADLINE_MS
    const created = await this.storeOffer({
      wacid: input.wacid,
      sdp: input.sdp,
      deadlineAt,
    })
    if (!created) {
      // Redelivered connect webhook for the same wacid within the offer's
      // TTL: the first offer and its immutable deadline stand, and a signaling
      // job is already in flight for it. Re-enqueuing here would re-ring the
      // agent and reset the deadline off a fresh `now`, so stop.
      return
    }
    // The offer key is now claimed (SET NX), so a later redelivery early-returns
    // above and will NOT retry the enqueue. If either enqueue throws (transient
    // Redis/BullMQ error), that would strand the call — offer stored but never
    // rung and never expired. So release the claim on failure: the next Meta
    // redelivery then re-stores the offer and re-enqueues cleanly.
    try {
      await this.enqueueHandleConnect(
        input.wacid,
        deadlineAt,
        input.phoneNumberId,
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
   * A VoIP-mode connect whose inline SDP was malformed/oversized (see
   * `parseCallSession`): enqueue the signaling job WITHOUT storing an offer, so
   * the consumer reads no offer and Meta-`reject`s the call. Never dropped into
   * the SIP path, which has no leg for a VoIP call. No expiry job is scheduled
   * — there is nothing to wait for.
   */
  async rejectUnprocessableConnect(input: {
    wacid: string
    phoneNumberId: string
  }): Promise<void> {
    await this.enqueueHandleConnect(
      input.wacid,
      Date.now() + VOIP_ANSWER_DEADLINE_MS,
      input.phoneNumberId,
    )
  }

  /** Enqueues the slim (SDP-free) `handleConnect` signaling job, replay-safe by deterministic id. */
  private async enqueueHandleConnect(
    wacid: string,
    deadlineAt: number,
    phoneNumberId: string,
  ): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.handleConnect,
      {
        type: WhatsappVoipSignalingJobAction.handleConnect,
        data: { wacid, deadlineAt, phoneNumberId },
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
   * Immutable first-seen SDP ANSWER store for an outbound call: `SET NX
   * PX`, keyed by `attemptId` (the only id known before Meta returns a
   * `wacid`) — the answer-direction counterpart of `storeOffer`. The SDP
   * never enters a BullMQ payload; this Redis handoff is the only path from
   * the answer webhook to the signaling consumer. Returns whether THIS call
   * created the record (`false` means a redelivery).
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
   * The webhook-boundary entry point for a BUSINESS_INITIATED `connect`
   * event's answer: resolves the pending `WhatsappCall` row — created
   * pre-dial, so it always exists by the time Meta's answer arrives —
   * stores the SDP in short-TTL Redis (never a BullMQ payload), then
   * enqueues the slim `handleOutboundAnswer` signaling job with a
   * deterministic `jobId` so a webhook redelivery dedups. Never throws into
   * the webhook: a row that can't be resolved is logged and dropped, since
   * there is nobody to forward the answer to.
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

    // The row's own `attemptId` is authoritative (it was minted at dial
    // time and echoed to Meta as `biz_opaque_callback_data`) — prefer it
    // over the caller's input, which may be "" on the wacid-fallback path.
    const attemptId = resolved.attemptId || input.attemptId
    if (!attemptId) {
      logger.warn(
        { wacid: input.wacid, whatsappCallId: resolved.id },
        "Whatsapp outbound answer: resolved call row has no attemptId; cannot store/enqueue the answer",
      )
      return
    }

    const created = await this.storeOutboundAnswer({
      attemptId,
      sdp: input.sdp,
    })
    if (!created) {
      // Redelivered answer webhook for the same attemptId: the first answer
      // stands, and a signaling job is already in flight for it.
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

  /** Enqueues the slim (SDP-free) `handleOutboundAnswer` signaling job, replay-safe by deterministic id. */
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
   * The webhook-boundary entry point for a Meta-native
   * `call_recording_available` event (VoIP-only — see
   * `docs/whatsapp-calling-voip.md`): resolves the `WhatsappCall` row by
   * `wacid` and enqueues the slim (media id/url/mime-type only, never the
   * audio bytes)
   * `whatsappCallNativeRecordingFetch` job, deterministically keyed by
   * `wacid` so a Meta webhook redelivery dedups on the queue side. Never
   * throws into the webhook: a row that can't be resolved (e.g. the call was
   * purged, or the webhook arrived before the row existed) is logged and
   * dropped rather than failing the whole webhook delivery.
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
      // Never drop the event because the row hasn't been created yet —
      // the recording webhook can race the row-creating `calls`
      // webhook/job. Enqueue anyway; the fetch job resolves the row by
      // `wacid` with bounded retry/backoff instead.
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
   * The webhook-boundary entry point for a Meta-native
   * `call_transcription_available` event (VoIP-only) — the
   * transcript-direction counterpart of
   * {@link captureNativeRecordingAvailable}: resolves the `WhatsappCall` row
   * by `wacid` and enqueues the slim `whatsappCallNativeTranscriptFetch` job
   * (document id/url only, never the transcript body), deterministically
   * keyed by `wacid`. Never throws into the webhook: no matching row is
   * logged and dropped.
   */
  async captureNativeTranscriptAvailable(
    input: CaptureNativeTranscriptAvailableInput,
  ): Promise<void> {
    const row = await whatsappCallRepository.findByWacid(input.wacid)
    if (!row) {
      // Never drop the event because the row hasn't been created yet —
      // enqueue anyway; the fetch job resolves the row by `wacid` with
      // bounded retry/backoff instead.
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
   * Durable deadline enforcement for the outbound dial/accept window — the
   * outbound counterpart of the `expireIfUnanswered` job
   * {@link captureConnectOffer} schedules. Called
   * by the app layer right after `startOutboundDial` succeeds, so a dial
   * that never gets an ACCEPTED status is terminated/finalized on schedule
   * even if every other signal is lost.
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
