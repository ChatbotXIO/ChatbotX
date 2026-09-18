import {
  callRecordingService,
  contactInboxService,
  whatsappCallLifecycleService,
} from "@chatbotx.io/business"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import {
  emitCallRecorded,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import {
  callTranscriptionJobId,
  callTranscriptionQueue,
  type IntegrationJobWhatsappCallRecordingReady,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import {
  enrichCallActivityMessage,
  waitUntilReady,
} from "./shared/whatsapp-call-finalize"

const DEFAULT_RECORDING_MIME_TYPE = "audio/ogg"

/**
 * External correlation is exposed as correlationId = wacid ?? attemptId in
 * events, never as callId. Exported so both the browserWhisper and Meta-native
 * fetch handlers reuse the same rule.
 */
export const externalCorrelationId = (call: {
  wacid: string | null
  attemptId: string | null
  id: string
}): string => call.wacid ?? call.attemptId ?? call.id

/**
 * Shared pipeline browserWhisper and Meta-native converge on: CAS
 * attachRecording (recordedAt IS NULL) makes this idempotent, attaches the
 * recording on the existing finalize message, enriches flags, fires
 * callRecorded. stamped.messageId/endedAt can still be null right after the
 * CAS wins if this webhook beat finalizeCallSideEffects's write - the race
 * waitUntilReady below waits out. recordedAt marks FINISHED not started, so
 * a failure after the CAS must release the stamp and rethrow for BullMQ to
 * retry the whole pipeline rather than short-circuit on an audio-less call.
 */
export const attachRecordingAndNotify = async (props: {
  call: WhatsappCallModel
  recordingPath: string
  mimeType?: string
  sizeBytes?: number
}): Promise<void> => {
  const { call, recordingPath, mimeType, sizeBytes } = props
  if (call.recordedAt) {
    return
  }

  const stampedAt = new Date()
  const stamped = await whatsappCallLifecycleService.attachRecording({
    id: call.id,
    recordingPath,
    recordedAt: stampedAt,
  })
  if (!stamped) {
    // Lost the CAS to a concurrent redelivery - the winning call already did
    // the attachment/enrichment/emit below.
    return
  }

  try {
    const finalized = await waitUntilReady(
      () => whatsappCallRepository.findById(call.id),
      (row) => Boolean(row?.messageId && row?.endedAt),
    )
    if (!(finalized?.messageId && finalized.endedAt)) {
      // Retryable on purpose: the finalize write is still in flight, and the
      // audio belongs on that message; giving up here would drop the
      // recording permanently.
      throw new Error(`whatsapp-call-recording-finalize-not-ready: ${call.id}`)
    }

    const repository = await createMessageRepository()
    const alreadyAttached = await repository.hasAttachmentOfType({
      workspaceId: call.workspaceId,
      messageId: finalized.messageId,
      messageCreatedAt: finalized.endedAt,
      fileType: "audio",
    })
    if (!alreadyAttached) {
      await repository.bulkCreateAttachments([
        {
          id: createId(),
          workspaceId: call.workspaceId,
          conversationId: call.conversationId,
          fileType: "audio",
          mimeType: mimeType ?? DEFAULT_RECORDING_MIME_TYPE,
          messageId: finalized.messageId,
          messageCreatedAt: finalized.endedAt,
          originPath: recordingPath,
          size: sizeBytes,
        },
      ])
    }

    await enrichCallActivityMessage({
      call: stamped,
      overrides: { hasRecording: true },
    })

    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (contactInbox) {
      const recordingUrl = await callRecordingService.getRecordingSignedUrl({
        recordingPath,
      })
      await emitCallRecorded(call.workspaceId, contactInbox.contactId, {
        callId: externalCorrelationId(call),
        recordingUrl,
      })
    }
  } catch (error) {
    // Hand the stamp back so the retry re-enters instead of short-circuiting on
    // it. Best-effort: if release itself fails, the original failure is the one
    // worth reporting.
    await whatsappCallLifecycleService
      .releaseRecordingStamp({ id: call.id, recordedAt: stampedAt })
      .catch((releaseError: unknown) => {
        logger.error(
          { err: normalizeError(releaseError), whatsappCallId: call.id },
          "[wa-call-recording] could not release the recording stamp after a failed attach",
        )
      })
    throw error
  }
}

/**
 * A browser-captured recording finished uploading: stamp it onto the call, drop
 * an audio message into the conversation, fire callRecorded, and chain
 * transcription. Every step is idempotent against redeliveries. Looked up by DB
 * callId, never wacid, so an outbound call with no wacid yet still resolves.
 */
export const handleWhatsappCallRecordingReady = async (
  data: IntegrationJobWhatsappCallRecordingReady["data"],
): Promise<void> => {
  // Channel-originated: without this, WebhookEventEmitter's isWebhookContext
  // gate silently drops emitCallRecorded (same override in whatsapp-call.ts).
  setWebhookExecutionContext({ source: "webhook" })
  const call = await whatsappCallRepository.findById(data.callId)
  if (!call) {
    logger.warn(
      { callId: data.callId },
      "[wa-call-recording] skipped: call row not found",
    )
    return
  }

  // recordedAt is stamped inside attachRecordingAndNotify - it marks post-
  // processing done, so a transient failure retries the whole handler instead
  // of being silently swallowed. Each step is individually replay-safe.
  if (call.recordedAt) {
    logger.info(
      { callId: data.callId },
      "[wa-call-recording] already processed; re-chaining transcription only",
    )
  } else {
    await attachRecordingAndNotify({
      call,
      recordingPath: data.recordingPath,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    })
  }

  // The transcription enqueue always runs last, in both branches: a crash
  // between the durable attachRecording and this enqueue must not strand the
  // call without a transcript. Deterministic jobId means a duplicate is a no-
  // op.
  await enqueueTranscription(data.callId, call.workspaceId)
}

/**
 * Deterministic jobId - replay-safe. Dedicated queue so a limiter can bound
 * transcription throughput independent of the shared integration queue's
 * traffic.
 */
const enqueueTranscription = async (
  callId: string,
  workspaceId: string,
): Promise<void> => {
  await callTranscriptionQueue.add(
    "transcribeCall",
    {
      type: "transcribeCall",
      data: { channel: "whatsapp", callId, workspaceId },
    },
    { jobId: callTranscriptionJobId(callId) },
  )
}
