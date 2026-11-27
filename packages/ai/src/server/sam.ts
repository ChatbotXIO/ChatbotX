/**
 * SAM 3.1 object detection over the Meta Model API (`/v1/responses`).
 *
 * Node/worker only — exported through `@chatbotx.io/ai/sam`, never through
 * `@chatbotx.io/ai/server`, so the stream code stays out of the builder's
 * Edge instrumentation graph (AGENTS.md invariant 25).
 *
 * Only boxes are read, parsed against the public grammar Meta documents for
 * writing your own parser instead of its SAM-licensed client packages:
 * - https://dev.meta.ai/docs/sam/reading-segmentation (`<0f>`, box tokens,
 *   inclusive `x2`/`y2`, empty `output_text` = no match)
 * - https://dev.meta.ai/docs/sam/segmenting (`include_confidence`,
 *   `mask_encoding`)
 * - https://dev.meta.ai/docs/sam/client-libraries ("write your own parsing
 *   against the documented grammar and skip these packages")
 * Mask tokens are skipped, never decoded.
 */
import { EventSourceParserStream } from "eventsource-parser/stream"
import ky from "ky"
import { z } from "zod"
import { MUSE_BASE_URL } from "../core/muse"
import {
  describeMuseErrorBody,
  isRetryableMuseStatus,
  parseMuseErrorBody,
} from "./muse-errors"

export const SAM_MODEL = "sam-3.1" as const

// `response.completed` echoes the whole output text, so one SSE event can be
// as large as every mask together. Bounds memory on a misbehaving stream.
export const SAM_MAX_SSE_BUFFER_CHARS = 16_000_000
// The same bound for the text lane, which can also arrive as many small
// deltas that each pass the per-event bound.
export const SAM_MAX_OUTPUT_TEXT_CHARS = 16_000_000
// A failed HTTP body is only read for its error detail.
const SAM_MAX_ERROR_BODY_CHARS = 4096
// Responses API error codes, sent after HTTP 200, that a new attempt can fix.
const RETRYABLE_STREAM_ERROR_CODES = new Set([
  "rate_limit_exceeded",
  "server_error",
])

export type SamSegmentationErrorCode =
  | "http_error"
  | "invalid_response"
  | "malformed_event"
  | "stream_error"
  | "incomplete"
  | "invalid_output"

/**
 * `retryable` and `status` are read by the heavy worker's retry policy
 * (`isRetryableHeavyError`): only Meta 408/429/5xx and transport failures
 * are worth a second paid attempt.
 */
export class SamSegmentationError extends Error {
  readonly code: SamSegmentationErrorCode
  readonly retryable: boolean
  readonly status?: number

  constructor(
    message: string,
    options: {
      cause?: unknown
      code: SamSegmentationErrorCode
      retryable: boolean
      status?: number
    },
  ) {
    super(message, { cause: options.cause })
    this.name = "SamSegmentationError"
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
  }
}

/** One matched object; bounds are half-open source pixels. */
export type SegmentationBox = {
  objectId: number
  left: number
  top: number
  right: number
  bottom: number
  confidence?: number
}

type SourceSize = { width: number; height: number }

export type SegmentImageInput = {
  apiKey: string
  /** The exact bytes the caller will later crop, so boxes align. */
  image: Uint8Array
  mimeType: string
  /** Pixel size of `image`; SAM must report the same frame size. */
  sourceSize: SourceSize
  /** Short concrete noun phrase, e.g. "red car". */
  target: string
  signal: AbortSignal
  /** Test seam; defaults to the global fetch through ky. */
  fetch?: typeof fetch
}

export type SegmentImageResult =
  | { kind: "no_match" }
  | { kind: "matched"; boxes: readonly SegmentationBox[] }

const samEventSchema = z.looseObject({ type: z.string().min(1) })
type SamEvent = z.infer<typeof samEventSchema>

const laneFields = {
  item_id: z.string(),
  output_index: z.number().int(),
  content_index: z.number().int(),
}
type LaneFields = {
  item_id: string
  output_index: number
  content_index: number
}

const textDeltaEventSchema = z.looseObject({
  ...laneFields,
  delta: z.string(),
})
const textDoneEventSchema = z.looseObject({ ...laneFields, text: z.string() })
const contentPartDoneEventSchema = z.looseObject({
  ...laneFields,
  part: z.looseObject({ type: z.string(), text: z.string().optional() }),
})
const incompleteEventSchema = z.looseObject({
  response: z
    .looseObject({
      incomplete_details: z
        .looseObject({ reason: z.string().optional() })
        .nullish(),
    })
    .optional(),
})
const failedEventSchema = z.looseObject({
  response: z.looseObject({ error: z.unknown() }).optional(),
})
const completedEventSchema = z.looseObject({
  response: z
    .looseObject({
      output: z
        .array(
          z.looseObject({
            content: z
              .array(
                z.looseObject({
                  type: z.string(),
                  text: z.string().optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

/** Keeps Meta's reason and retries only the codes a new attempt can fix. */
function streamFailure(source: string, body: unknown): SamSegmentationError {
  const code = parseMuseErrorBody(body)?.code
  const detail = describeMuseErrorBody(body)
  return new SamSegmentationError(
    `SAM stream failed: ${source}${detail ? `: ${detail}` : ""}`,
    {
      code: "stream_error",
      retryable:
        typeof code === "string" && RETRYABLE_STREAM_ERROR_CODES.has(code),
    },
  )
}

function streamError(message: string): SamSegmentationError {
  return new SamSegmentationError(message, {
    code: "stream_error",
    retryable: false,
  })
}

function invalidOutput(message: string): SamSegmentationError {
  return new SamSegmentationError(`SAM output is malformed: ${message}`, {
    code: "invalid_output",
    retryable: false,
  })
}

function parseEvent<T>(schema: z.ZodType<T>, event: SamEvent): T {
  const parsed = schema.safeParse(event)
  if (!parsed.success) {
    throw new SamSegmentationError(`SAM ${event.type} event is malformed`, {
      cause: parsed.error,
      code: "malformed_event",
      retryable: false,
    })
  }
  return parsed.data
}

/** UTF-8 decoding that keeps a character split across network chunks. */
function utf8DecoderStream(): TransformStream<Uint8Array, string> {
  const decoder = new TextDecoder()
  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true })
      if (text) {
        controller.enqueue(text)
      }
    },
    flush(controller) {
      const text = decoder.decode()
      if (text) {
        controller.enqueue(text)
      }
    },
  })
}

/**
 * A broken SSE frame (e.g. one over the buffer bound) is a protocol fault, not
 * a network one: retrying would pay for the same broken response again. Any
 * other read failure is transport and worth a retry.
 */
async function readNext(
  reader: ReadableStreamDefaultReader<{ data: string }>,
): Promise<ReadableStreamReadResult<{ data: string }>> {
  try {
    return await reader.read()
  } catch (error) {
    // Matched by name: `eventsource-parser` and its `/stream` entry can load
    // as separate ESM/CJS copies, so `instanceof ParseError` is not reliable.
    if (error instanceof Error && error.name === "ParseError") {
      throw new SamSegmentationError(
        `SAM stream is malformed: ${error.message}`,
        {
          cause: error,
          code: "malformed_event",
          retryable: false,
        },
      )
    }
    throw new SamSegmentationError("SAM stream read failed", {
      cause: error,
      code: "stream_error",
      retryable: true,
    })
  }
}

async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SamEvent> {
  const reader = body
    .pipeThrough(utf8DecoderStream())
    .pipeThrough(
      new EventSourceParserStream({
        maxBufferSize: SAM_MAX_SSE_BUFFER_CHARS,
        // SSE says unknown fields and bad `retry:` values are ignored, so a
        // new Meta field must not kill the stream. A buffer overflow still
        // errors it regardless of this callback.
        onError: () => undefined,
      }),
    )
    .getReader()

  try {
    while (true) {
      const { done, value } = await readNext(reader)
      if (done) {
        return
      }
      if (value.data === "[DONE]") {
        continue
      }
      let json: unknown
      try {
        json = JSON.parse(value.data)
      } catch (error) {
        throw new SamSegmentationError("SAM stream event is not valid JSON", {
          cause: error,
          code: "malformed_event",
          retryable: false,
        })
      }
      const parsed = samEventSchema.safeParse(json)
      if (!parsed.success) {
        throw new SamSegmentationError("SAM stream event has no type", {
          cause: parsed.error,
          code: "malformed_event",
          retryable: false,
        })
      }
      yield parsed.data
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

type TextLane = { key: string; deltas: string; final?: string }

function laneKey(event: LaneFields): string {
  return `${event.item_id}:${event.output_index}:${event.content_index}`
}

/**
 * Returns the finalized text of the single output-text lane once the response
 * completes. SAM writes one lane; a second lane, text after finalization or
 * a finalizer that disagrees with the deltas means the output can't be
 * trusted. Live streams finalize with `response.content_part.done` only, but
 * `response.output_text.done` is accepted too and must agree.
 */
async function readOutputText(
  events: AsyncIterable<SamEvent>,
): Promise<string> {
  let lane: TextLane | undefined

  const openLane = (key: string): TextLane => {
    if (lane && lane.key !== key) {
      throw streamError("SAM stream has more than one output text lane")
    }
    lane ??= { key, deltas: "" }
    return lane
  }

  const finalize = (key: string, text: string) => {
    const current = openLane(key)
    if (current.final !== undefined && current.final !== text) {
      throw streamError("SAM stream finalized its text lane twice, differently")
    }
    if (current.deltas && current.deltas !== text) {
      throw streamError("SAM finalized text does not match its deltas")
    }
    current.final = text
  }

  for await (const event of events) {
    switch (event.type) {
      case "response.output_text.delta": {
        const delta = parseEvent(textDeltaEventSchema, event)
        const current = openLane(laneKey(delta))
        if (current.final !== undefined) {
          throw streamError("SAM stream sent text after finalizing its lane")
        }
        current.deltas += delta.delta
        if (current.deltas.length > SAM_MAX_OUTPUT_TEXT_CHARS) {
          throw invalidOutput(
            `output text exceeds ${SAM_MAX_OUTPUT_TEXT_CHARS} characters`,
          )
        }
        break
      }
      case "response.output_text.done": {
        const done = parseEvent(textDoneEventSchema, event)
        finalize(laneKey(done), done.text)
        break
      }
      case "response.content_part.done": {
        const done = parseEvent(contentPartDoneEventSchema, event)
        if (done.part.type === "refusal") {
          throw streamError("SAM refused the request")
        }
        if (done.part.type === "output_text") {
          finalize(laneKey(done), done.part.text ?? "")
        }
        break
      }
      case "response.refusal.delta":
      case "response.refusal.done":
        throw streamError("SAM refused the request")
      case "response.failed":
        throw streamFailure(
          "response.failed",
          parseEvent(failedEventSchema, event).response?.error,
        )
      case "error": {
        // The detail sits on the event itself; `type` is the event name.
        const { type: _type, ...body } = event
        throw streamFailure("error event", body)
      }
      case "response.incomplete": {
        const reason =
          parseEvent(incompleteEventSchema, event).response?.incomplete_details
            ?.reason ?? "unknown"
        throw new SamSegmentationError(`SAM stream ended early: ${reason}`, {
          code: "incomplete",
          retryable: false,
        })
      }
      case "response.completed":
        if (!lane) {
          return completedOutputText(parseEvent(completedEventSchema, event))
        }
        if (lane.final === undefined) {
          throw streamError("SAM completed without finalizing its text lane")
        }
        return lane.final
      default:
        // Lifecycle and other Responses events carry no segmentation data.
        break
    }
  }

  throw new SamSegmentationError("SAM stream ended before response.completed", {
    code: "incomplete",
    retryable: false,
  })
}

/**
 * A completion that streamed no text lane still echoes its output, so read
 * it there. No output text at all is a broken response, not "no match".
 */
function completedOutputText(
  event: z.infer<typeof completedEventSchema>,
): string {
  const texts: string[] = []
  for (const item of event.response?.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "refusal") {
        throw streamError("SAM refused the request")
      }
      if (part.type === "output_text") {
        texts.push(part.text ?? "")
      }
    }
  }
  const [text, ...rest] = texts
  if (text === undefined) {
    throw streamError("SAM completed without output text")
  }
  if (rest.length > 0) {
    throw streamError("SAM stream has more than one output text lane")
  }
  return text
}

const DIGIT = /\d/
const DIGITS = /^\d+$/
// Any decimal float form (`0.5`, `.5`, `1`, `5e-05`).
const CONFIDENCE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const FRAME_PREFIX = /^<(\d+)f>/

function readInteger(fields: Map<string, string>, key: string): number {
  const raw = fields.get(key)
  const value = raw !== undefined && DIGITS.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(value)) {
    throw invalidOutput(`box field "${key}" is not a non-negative integer`)
  }
  return value
}

/** `box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]`; fields go by key. */
function parseBox(
  body: string,
  objectId: number,
  sourceSize: SourceSize,
): SegmentationBox {
  const fields = new Map<string, string>()
  for (const field of body.split(";").slice(1)) {
    const separator = field.indexOf("=")
    if (separator <= 0) {
      throw invalidOutput(`box field "${field}" has no key`)
    }
    const key = field.slice(0, separator)
    if (fields.has(key)) {
      throw invalidOutput(`box repeats field "${key}"`)
    }
    fields.set(key, field.slice(separator + 1))
  }

  const width = readInteger(fields, "w")
  const height = readInteger(fields, "h")
  if (width !== sourceSize.width || height !== sourceSize.height) {
    // SAM saw different pixels than the caller will crop.
    throw invalidOutput(
      `frame ${width}x${height} does not match the source image ${sourceSize.width}x${sourceSize.height}`,
    )
  }
  const x1 = readInteger(fields, "x1")
  const y1 = readInteger(fields, "y1")
  const x2 = readInteger(fields, "x2")
  const y2 = readInteger(fields, "y2")
  if (x1 > x2 || y1 > y2 || x2 >= width || y2 >= height) {
    throw invalidOutput(`box ${x1},${y1},${x2},${y2} is outside its frame`)
  }

  const box: SegmentationBox = {
    objectId,
    left: x1,
    top: y1,
    // `x2`/`y2` are inclusive.
    right: x2 + 1,
    bottom: y2 + 1,
  }
  // Confidence is informational: an unreadable one is dropped, never allowed
  // to discard the boxes of a paid response.
  const confidence = Number(fields.get("c"))
  if (
    CONFIDENCE.test(fields.get("c") ?? "") &&
    confidence >= 0 &&
    confidence <= 1
  ) {
    box.confidence = confidence
  }
  return box
}

/** After `<0f>`: comma-separated `<id><|box;…|>[<|mask;…|>…]` objects. */
function parseFrameObjects(
  line: string,
  offset: number,
  sourceSize: SourceSize,
): SegmentationBox[] {
  const boxes: SegmentationBox[] = []
  const seen = new Set<number>()
  let position = offset

  while (position < line.length) {
    const idStart = position
    while (position < line.length && DIGIT.test(line.charAt(position))) {
      position += 1
    }
    const objectId = Number(line.slice(idStart, position))
    if (position === idStart || !Number.isSafeInteger(objectId)) {
      throw invalidOutput(`expected an object id at column ${idStart}`)
    }
    if (seen.has(objectId)) {
      throw invalidOutput(`object ${objectId} appears twice in one frame`)
    }
    seen.add(objectId)

    let box: SegmentationBox | undefined
    while (line.startsWith("<|", position)) {
      const end = line.indexOf("|>", position + 2)
      if (end === -1) {
        throw invalidOutput(`unterminated token at column ${position}`)
      }
      const body = line.slice(position + 2, end)
      position = end + 2
      // Mask payloads (and any token kind added later) are not needed.
      if (body === "box" || body.startsWith("box;")) {
        if (box) {
          throw invalidOutput(`object ${objectId} has two boxes`)
        }
        box = parseBox(body, objectId, sourceSize)
      }
    }
    if (!box) {
      throw invalidOutput(`object ${objectId} has no box`)
    }
    boxes.push(box)

    if (position < line.length) {
      if (line.charAt(position) !== ",") {
        throw invalidOutput(`unexpected text at column ${position}`)
      }
      position += 1
      if (position === line.length) {
        throw invalidOutput("frame ends with a separator")
      }
    }
  }
  return boxes
}

/**
 * An image has one frame, `<0f>`. Lines without tokens are prose (zero
 * matches); a later line for the same object replaces the earlier one.
 */
function parseOutputText(
  text: string,
  sourceSize: SourceSize,
): SegmentationBox[] {
  const byObject = new Map<number, SegmentationBox>()
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const frame = FRAME_PREFIX.exec(line)
    if (!frame) {
      if (line.startsWith("<") || line.includes("<|")) {
        throw invalidOutput("line does not start with a frame marker")
      }
      continue
    }
    if (frame[1] !== "0") {
      throw invalidOutput(`image output has frame ${frame[1]}`)
    }
    for (const box of parseFrameObjects(line, frame[0].length, sourceSize)) {
      byObject.set(box.objectId, box)
    }
  }
  return [...byObject.values()]
}

/**
 * Reads at most `SAM_MAX_ERROR_BODY_CHARS` of a failed response, then
 * releases the body. JSON is parsed for its detail; anything else is text.
 */
async function readErrorBody(response: Response): Promise<unknown> {
  const reader = response.body?.pipeThrough(utf8DecoderStream()).getReader()
  if (!reader) {
    return
  }
  let text = ""
  try {
    while (text.length < SAM_MAX_ERROR_BODY_CHARS) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      text += value
    }
  } catch {
    // The status alone still describes the failure.
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, SAM_MAX_ERROR_BODY_CHARS)
  }
}

export async function segmentImage(
  input: SegmentImageInput,
): Promise<SegmentImageResult> {
  const response = await ky.post(`${MUSE_BASE_URL}/responses`, {
    fetch: input.fetch,
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${input.apiKey}`,
    },
    json: {
      model: SAM_MODEL,
      stream: true,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: input.target },
            {
              type: "input_image",
              image_url: `data:${input.mimeType};base64,${Buffer.from(input.image).toString("base64")}`,
            },
          ],
        },
      ],
      // Masks are skipped, so ask for the smallest encoding.
      metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    },
    retry: { limit: 0 },
    signal: input.signal,
    throwHttpErrors: false,
    // The caller's signal is the deadline; ky's default 10s would cut off a
    // slow first byte.
    timeout: false,
  })

  if (!response.ok) {
    const detail = describeMuseErrorBody(await readErrorBody(response))
    throw new SamSegmentationError(
      `SAM request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      {
        code: "http_error",
        retryable: isRetryableMuseStatus(response.status),
        status: response.status,
      },
    )
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!(contentType.includes("text/event-stream") && response.body)) {
    await response.body?.cancel().catch(() => undefined)
    throw new SamSegmentationError(
      `SAM response is not an event stream: ${contentType || "unknown"}`,
      { code: "invalid_response", retryable: false },
    )
  }

  const text = await readOutputText(readSseEvents(response.body))
  const boxes = parseOutputText(text, input.sourceSize)
  if (boxes.length === 0) {
    return { kind: "no_match" }
  }
  return { kind: "matched", boxes }
}
