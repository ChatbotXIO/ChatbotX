import {
  contactInboxService,
  whatsappCallLifecycleService,
} from "@chatbotx.io/business"
import type { WhatsappCallTranscriptSegments } from "@chatbotx.io/database/partials"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import {
  emitCallTranscribed,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import type { IntegrationJobWhatsappCallNativeTranscriptFetch } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"
import {
  AttachmentTooLargeError,
  downloadCallMedia,
  WhatsappCallMediaGoneError,
  WhatsappCallRowNotReadyError,
} from "./shared/whatsapp-call-native-media"
import { enrichRecordingMessageWithTranscript } from "./shared/whatsapp-call-recording-enrichment"
import { externalCorrelationId } from "./whatsapp-call-recording"
import { resolveVoipAuthByInboxId } from "./whatsapp-voip-signaling"

const DEFAULT_TRANSCRIPT_DOCUMENT_MIME_TYPE = "application/json"

/**
 * Shape of the transcript document Meta's media id/url resolves to. Validated
 * since it's untrusted content fetched over the network; speaker/channel are
 * present only for a diarized Meta-native transcript.
 */
const metaTranscriptSegmentSchema = z.object({
  // Meta sends the segment id as an integer, not a string — typing it as
  // z.string made the whole document fail safeParse, dropping every transcript
  // as malformed. Accept both.
  id: z.union([z.string(), z.number()]).optional(),
  speaker: z.string().optional(),
  channel: z.number().int().optional(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  confidence: z.number().optional(),
  words: z.unknown().optional(),
})

const metaTranscriptDocumentSchema = z.object({
  metadata: z.unknown().optional(),
  transcript: z.object({
    text: z.string().optional(),
    language: z.string().optional(),
    duration: z.number().optional(),
    confidence: z.number().optional(),
    // Deliberately optional and possibly empty: Meta fires this webhook even
    // when the spoken language isn't supported for transcription, in which case
    // segments is an empty array.
    segments: z.array(metaTranscriptSegmentSchema).optional(),
  }),
})

/**
 * Maps Meta's segment shape onto our WhatsappCallTranscriptSegments column
 * shape (drops id/confidence/words).
 */
const mapSegments = (
  segments: readonly z.infer<typeof metaTranscriptSegmentSchema>[],
): WhatsappCallTranscriptSegments =>
  segments.map((segment) => ({
    ...(segment.speaker === undefined ? {} : { speaker: segment.speaker }),
    ...(segment.channel === undefined ? {} : { channel: segment.channel }),
    start: segment.start,
    end: segment.end,
    text: segment.text,
  }))

/**
 * The flat transcript backing {{last_call_transcript}}/search: prefer Meta's
 * own transcript.text, otherwise concatenate segment texts. When both are empty
 * (unsupported language), resolves to "" — deliberately distinct from null so
 * attachTranscript's CAS still treats a later redelivery as already-processed.
 */
const resolveFlatTranscript = (
  text: string | undefined,
  segments: WhatsappCallTranscriptSegments,
): string => {
  if (text && text.trim().length > 0) {
    return text
  }
  return segments
    .map((segment) => segment.text)
    .join(" ")
    .trim()
}

/**
 * Meta-native call transcript fetch: the webhook only carries a document media
 * id + short-lived URL, never the body. Empty segments (unsupported language)
 * still persist segments: [] and a flat "" transcript, distinct from null, so
 * the UI shows "unavailable" rather than unprocessed. Independent of the
 * recording fetch job — races on disjoint columns. Idempotent via an explicit
 * transcript !== null guard (not truthiness, since a persisted "" must still
 * short-circuit). The row may not exist yet at first attempt, so this always
 * re-resolves by wacid and throws WhatsappCallRowNotReadyError (retryable,
 * bounded ~1h) while missing.
 */
export const handleWhatsappCallNativeTranscriptFetch = async (
  data: IntegrationJobWhatsappCallNativeTranscriptFetch["data"],
): Promise<void> => {
  // Channel-originated: required for emitCallTranscribed.
  setWebhookExecutionContext({ source: "webhook" })

  logger.info(
    { whatsappCallId: data.whatsappCallId, wacid: data.wacid },
    "[wa-call-transcript] fetch job START (Meta-native)",
  )

  const byId = data.whatsappCallId
    ? await whatsappCallRepository.findById(data.whatsappCallId)
    : undefined
  const call = byId ?? (await whatsappCallRepository.findByWacid(data.wacid))
  if (!call) {
    logger.warn(
      { whatsappCallId: data.whatsappCallId, wacid: data.wacid },
      "[wa-call-transcript] : call row not found yet; retrying",
    )
    throw new WhatsappCallRowNotReadyError(data.wacid)
  }
  // See the matching guard in whatsapp-call-native-recording.ts: a job enqueued
  // before its row existed bypassed the worker-level gate.
  if (!data.workspaceId && (await isBlockedWorkspace(call.workspaceId))) {
    logger.info(
      { whatsappCallId: call.id, workspaceId: call.workspaceId },
      "[wa-call-transcript]  skipped: blocked workspace",
    )
    return
  }
  if (call.transcript !== null) {
    logger.info(
      { whatsappCallId: call.id },
      "[wa-call-transcript]  already processed; skipping",
    )
    return
  }

  let media: Awaited<ReturnType<typeof downloadCallMedia>>
  try {
    const auth = await resolveVoipAuthByInboxId(call.inboxId)
    media = await downloadCallMedia({
      mediaId: data.documentMediaId,
      url: data.documentUrl,
      auth,
      fallbackMime: DEFAULT_TRANSCRIPT_DOCUMENT_MIME_TYPE,
      label: "call transcript",
    })
  } catch (err) {
    if (err instanceof WhatsappCallMediaGoneError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: call.id },
        "[wa-call-transcript] : media no longer available; skipping",
      )
      return
    }
    if (err instanceof AttachmentTooLargeError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: call.id },
        "[wa-call-transcript] : exceeds size cap; skipping (permanent)",
      )
      return
    }
    logger.error(
      { err: normalizeError(err), whatsappCallId: call.id },
      "[wa-call-transcript]  download failed",
    )
    throw err
  }

  let parsedTranscript: z.infer<
    typeof metaTranscriptDocumentSchema
  >["transcript"]
  try {
    const text = new TextDecoder().decode(media.bytes)
    const parsed = metaTranscriptDocumentSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      // A malformed document is a permanent condition — the same bytes fail
      // identically on retry — so this skips rather than throwing (never logs
      // the document body itself).
      logger.error(
        {
          whatsappCallId: call.id,
          issues: parsed.error.issues,
        },
        "[wa-call-transcript] : malformed document; skipping",
      )
      return
    }
    parsedTranscript = parsed.data.transcript
  } catch (err) {
    logger.error(
      { err: normalizeError(err), whatsappCallId: call.id },
      "[wa-call-transcript] : failed to parse document; skipping",
    )
    return
  }

  const segments = mapSegments(parsedTranscript.segments ?? [])
  const transcript = resolveFlatTranscript(parsedTranscript.text, segments)

  const stamped = await whatsappCallLifecycleService.attachTranscript({
    id: call.id,
    transcript,
    transcribedAt: new Date(),
    segments,
  })
  if (!stamped) {
    // Lost the CAS to a concurrent redelivery — the winning write already did
    // the enrichment/emit below.
    return
  }

  await enrichRecordingMessageWithTranscript({ call })
  logger.info(
    {
      whatsappCallId: call.id,
      wacid: call.wacid,
      transcriptChars: transcript.length,
      segments: segments.length,
    },
    "[wa-call-transcript] DONE (transcript attached + card enriched)",
  )

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  if (contactInbox) {
    await emitCallTranscribed(call.workspaceId, contactInbox.contactId, {
      callId: externalCorrelationId(call),
      transcript,
    })
  }
}
