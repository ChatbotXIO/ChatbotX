import { contactInboxService } from "@chatbotx.io/business"
import type { WhatsappCallTranscriptSegments } from "@chatbotx.io/database/partials"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import {
  emitCallTranscribed,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import type { IntegrationJobWhatsappCallNativeTranscriptFetch } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../lib/logger"
import {
  AttachmentTooLargeError,
  downloadCallMedia,
  WhatsappCallMediaGoneError,
} from "./shared/whatsapp-call-native-media"
import { enrichRecordingMessageWithTranscript } from "./shared/whatsapp-call-recording-enrichment"
import { externalCorrelationId } from "./whatsapp-call-recording"
import { resolveVoipAuthByInboxId } from "./whatsapp-voip-signaling"

const DEFAULT_TRANSCRIPT_DOCUMENT_MIME_TYPE = "application/json"

/**
 * Shape of the transcript document Meta's `call_transcript.document` media
 * id/url resolves to. Validated (never trusted) since
 * it is untrusted content fetched over the network; a segment's
 * `speaker`/`channel` are present only for a diarized Meta-native transcript.
 */
const metaTranscriptSegmentSchema = z.object({
  // Meta sends the segment id as an INTEGER (`"id": 1`), not a string —
  // typing it as `z.string` made the whole document fail `safeParse`, so
  // EVERY transcript was dropped as "malformed" and the call showed
  // "Transcript unavailable" regardless of language. Accept both (and it is
  // dropped by `mapSegments` anyway).
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
    // Deliberately optional AND possibly empty: Meta fires this webhook even
    // when the spoken language isn't supported for transcription, in which
    // case `segments` is an empty array — the "unavailable for this call's
    // language" case (see `handleWhatsappCallNativeTranscriptFetch`).
    segments: z.array(metaTranscriptSegmentSchema).optional(),
  }),
})

/** Maps Meta's segment shape onto our `WhatsappCallTranscriptSegments` column shape (drops `id`/`confidence`/`words`). */
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
 * The flat transcript backing `{{last_call_transcript}}`/search: prefer
 * Meta's own flattened `transcript.text` when present, otherwise
 * concatenate the diarized segment texts. When both are empty (the
 * unsupported-language case), this resolves to `""` — deliberately distinct
 * from `null` so `attachTranscript`'s CAS (`transcript IS NULL`) still
 * treats a later redelivery as already-processed instead of re-fetching.
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
 * Meta-native call transcript fetch: the
 * `call_transcription_available` webhook only carries a document media id +
 * a short-lived lookaside URL, never the transcript body — this downloads
 * the JSON document (preferring the media id, see `downloadCallMedia`),
 * parses + maps it to our diarized `segments` shape, stamps the
 * `WhatsappCall` row via `attachTranscript`, then reuses the exact
 * recording-message enrichment + `emitCallTranscribed` broadcast the SIP/
 * Whisper path uses so the realtime update-in-place logic isn't duplicated.
 *
 * Handles the empty-segments case (the spoken language wasn't supported for
 * transcription): still persists `segments: []` + a flat `""` transcript —
 * distinct from `null` — so the UI can render "Transcript unavailable for
 * this call's language" rather than treating the call as never processed.
 *
 * Independent of `handleWhatsappCallNativeRecordingFetch`: the two jobs
 * race on disjoint `WhatsappCall` columns and neither waits on the other.
 * Idempotent on redelivery via the `call.transcript !== null` guard below
 * (an explicit null-check, not a truthiness check — an already-persisted
 * `""` must still short-circuit) backed by `attachTranscript`'s own CAS.
 */
export const handleWhatsappCallNativeTranscriptFetch = async (
  data: IntegrationJobWhatsappCallNativeTranscriptFetch["data"],
): Promise<void> => {
  // Channel-originated: required for emitCallTranscribed (see the analogous
  // override in whatsapp-call-transcribe.ts).
  setWebhookExecutionContext({ source: "webhook" })

  const call = await whatsappCallRepository.findById(data.whatsappCallId)
  if (!call) {
    logger.warn(
      { whatsappCallId: data.whatsappCallId, wacid: data.wacid },
      "Whatsapp native call transcript skipped: call row not found",
    )
    return
  }
  if (call.transcript !== null) {
    logger.info(
      { whatsappCallId: data.whatsappCallId },
      "Whatsapp native call transcript already processed; skipping",
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
        { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
        "Whatsapp native call transcript: media no longer available; skipping",
      )
      return
    }
    if (err instanceof AttachmentTooLargeError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
        "Whatsapp native call transcript: exceeds size cap; skipping (permanent)",
      )
      return
    }
    logger.error(
      { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
      "Whatsapp native call transcript download failed",
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
      // identically on retry — so this skips rather than throwing (never
      // logs the document body itself, only the validation issues).
      logger.error(
        {
          whatsappCallId: data.whatsappCallId,
          issues: parsed.error.issues,
        },
        "Whatsapp native call transcript: malformed document; skipping",
      )
      return
    }
    parsedTranscript = parsed.data.transcript
  } catch (err) {
    logger.error(
      { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
      "Whatsapp native call transcript: failed to parse document; skipping",
    )
    return
  }

  const segments = mapSegments(parsedTranscript.segments ?? [])
  const transcript = resolveFlatTranscript(parsedTranscript.text, segments)

  const stamped = await whatsappCallRepository.attachTranscript({
    id: data.whatsappCallId,
    transcript,
    transcribedAt: new Date(),
    segments,
  })
  if (!stamped) {
    // Lost the CAS to a concurrent redelivery — the winning write already
    // did the enrichment/emit below.
    return
  }

  await enrichRecordingMessageWithTranscript({ call })

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
