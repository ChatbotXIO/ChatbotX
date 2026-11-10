import {
  type Context,
  type FlowResponseFile,
  type FlowResponseFileFailureReason,
  getMediaStoragePrefix,
  getWhatsappFlowResponse,
  type IncomingAttachment,
  type IncomingFileType,
  type IncomingMessage,
  type MessageWhatsappFlowResponseEntity,
} from "@chatbotx.io/sdk"
import {
  createConcurrencyLimiter,
  mapWithConcurrency,
  withTimeout,
} from "@chatbotx.io/utils"
import { sanitizeFileName } from "@chatbotx.io/utils/sanitize-file-name"
import {
  storeIncomingImage,
  toStoredMediaFields,
} from "@chatbotx.io/utils/store-incoming-image"
import { DEFAULT_API_VERSION } from "../../constants"
import { logger } from "../../lib/logger"
import { asString, isRecord } from "../../lib/value"
import type { WhatsappAuthValue } from "../../schema"
import {
  type DownloadRequest,
  downloadFlowMedia,
  FlowMediaFailure,
  isAllowedMimeType,
  remainingMsOrFail,
} from "./flow-media-download"
import type { IncomingMessageFragment } from "./message-parser-types"

type FlowMediaPolicy = {
  /** Meta's limits: files and bytes per response message, bytes per file. */
  maxFiles: number
  maxTotalBytes: number
  maxFileBytes: number
  concurrency: number
  /** Total tries per file, the first included. */
  maxAttempts: number
  retryDelayMs: number
  requestTimeoutMs: number
  /** After this, files not yet kept fail instead of stalling the message. */
  deadlineMs: number
}

const MIB = 1024 * 1024

export const DEFAULT_FLOW_MEDIA_POLICY: FlowMediaPolicy = {
  maxFiles: 10,
  maxTotalBytes: 100 * MIB,
  maxFileBytes: 25 * MIB,
  concurrency: 3,
  maxAttempts: 2,
  retryDelayMs: 500,
  requestTimeoutMs: 20_000,
  deadlineMs: 45_000,
}

/**
 * Files held in memory at once by this process, across every response being
 * ingested: each one is up to 25 MiB from download to upload, and the worker
 * runs several jobs side by side.
 */
const MAX_FILES_IN_FLIGHT_PER_PROCESS = 3
const runWithFileSlot = createConcurrencyLimiter(
  MAX_FILES_IN_FLIGHT_PER_PROCESS,
)

const FILE_TYPE_BY_MIME_PREFIX: ReadonlyArray<
  readonly [prefix: string, fileType: IncomingFileType]
> = [
  ["image/", "image"],
  ["video/", "video"],
]

/** Code point ranges (inclusive) a file name never shows: controls and bidi overrides. */
const HIDDEN_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x20_0e, 0x20_0f],
  [0x20_2a, 0x20_2e],
  [0x20_66, 0x20_69],
]
const PATH_SEPARATORS: ReadonlySet<string> = new Set(["/", "\\"])
const MAX_DISPLAY_NAME_LENGTH = 255
const DEFAULT_DISPLAY_NAME = "file"

type FlowMediaEntry = {
  id: string
  fileName: string
  mimeType: string
}

type FlowMediaGroup = {
  /** The response key the answer is under. */
  key: string
  entries: FlowMediaEntry[]
}

type FlowMediaOutcome = {
  file: FlowResponseFile
  attachment?: IncomingAttachment
}

type FlowMediaContext = Context<WhatsappAuthValue>

/**
 * A Flow upload's media id as a string. Meta sends it as a JSON number in
 * practice and Meta's docs do not fix its type, so both are accepted. A number
 * that is not a safe integer has already lost digits in parsing: not an id.
 */
const toMediaId = (value: unknown): string | null => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : null
  }
  return asString(value)
}

const toFlowMediaEntry = (value: unknown): FlowMediaEntry | null => {
  if (!isRecord(value)) {
    return null
  }
  const id = toMediaId(value.id)
  const fileName = asString(value.file_name)
  const mimeType = asString(value.mime_type)
  return id && fileName && mimeType ? { id, fileName, mimeType } : null
}

/** A list of uploaded files, or null when any item is not one (or it is empty). */
const toFlowMediaEntries = (value: unknown): FlowMediaEntry[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }
  const entries: FlowMediaEntry[] = []
  for (const item of value) {
    const entry = toFlowMediaEntry(item)
    if (!entry) {
      return null
    }
    entries.push(entry)
  }
  return entries
}

/**
 * The answers of a response that are lists of uploaded files. An answer counts
 * only when every item has the file shape, so an ordinary multi-select or an
 * empty list is never mistaken for one.
 */
export const extractFlowMediaGroups = (
  flowResponse: Record<string, unknown>,
): FlowMediaGroup[] =>
  Object.entries(flowResponse).flatMap(([key, value]) => {
    const entries = toFlowMediaEntries(value)
    return entries ? [{ key, entries }] : []
  })

const isDisplayableCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0
  return !(
    PATH_SEPARATORS.has(character) ||
    HIDDEN_CODE_POINT_RANGES.some(
      ([first, last]) => codePoint >= first && codePoint <= last,
    )
  )
}

/** What the customer's file name shows as: no path parts, controls or bidi overrides. */
const toDisplayName = (fileName: string): string => {
  const cleaned = [...fileName]
    .filter(isDisplayableCharacter)
    .join("")
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
  return cleaned || DEFAULT_DISPLAY_NAME
}

const toFileType = (mimeType: string): IncomingFileType =>
  FILE_TYPE_BY_MIME_PREFIX.find(([prefix]) =>
    mimeType.startsWith(prefix),
  )?.[1] ?? "file"

/**
 * Counts the bytes a response has kept against Meta's total. It counts what a
 * file really weighed once received, never a guess of it, so files fetched at
 * the same time cannot turn each other away.
 */
class ByteBudget {
  private remaining: number

  constructor(totalBytes: number) {
    this.remaining = totalBytes
  }

  /** What one more file may weigh: its own cap or the allowance left, whichever is lower. */
  limitFor(maxFileBytes: number): number {
    return Math.min(maxFileBytes, this.remaining)
  }

  /** Takes the bytes of a received file; false when they no longer fit. */
  consume(bytes: number): boolean {
    if (bytes > this.remaining) {
      return false
    }
    this.remaining -= bytes
    return true
  }
}

const failedOutcome = (
  entry: FlowMediaEntry,
  reason: FlowResponseFileFailureReason,
): FlowMediaOutcome => ({
  file: {
    status: "failed",
    mediaId: entry.id,
    fileName: toDisplayName(entry.fileName),
    mimeType: entry.mimeType,
    reason,
  },
})

type IngestContext = {
  ctx: FlowMediaContext
  policy: FlowMediaPolicy
  budget: ByteBudget
  request: DownloadRequest
}

/**
 * Stored like any inbound media, under the channel's prefix, with a random
 * UUID in the key, so every download is a new object (a redelivery's copy is
 * left unreferenced: the saved message keeps its first attachments). The
 * upload is held to the response's deadline and cancelled when it passes, so a
 * stalled upload neither keeps the message waiting nor holds its bytes.
 */
const storeMedia = async (
  ctx: FlowMediaContext,
  entry: FlowMediaEntry,
  media: { bytes: Buffer; mimeType: string },
  deadlineAt: number,
) => {
  if (!ctx.uploader) {
    throw new FlowMediaFailure("download_failed")
  }
  const remainingMs = remainingMsOrFail(deadlineAt)
  return await withTimeout(
    storeIncomingImage({
      uploader: ctx.uploader,
      // A cryptographically random part (Web Crypto, Edge-safe): the file is
      // public, so its link must not be derivable or guessable.
      key: `${getMediaStoragePrefix(ctx)}/${crypto.randomUUID()}-${sanitizeFileName(entry.fileName)}`,
      bytes: media.bytes,
      mimeType: media.mimeType,
      profile: "original",
      acl: "public-read",
      abortSignal: AbortSignal.timeout(remainingMs),
    }),
    remainingMs,
  )
}

const keepEntry = async (
  entry: FlowMediaEntry,
  { ctx, policy, budget, request }: IngestContext,
): Promise<FlowMediaOutcome> => {
  const limit = budget.limitFor(policy.maxFileBytes)
  if (limit <= 0) {
    throw new FlowMediaFailure("too_large")
  }
  // The `sha256` Meta sends is not checked: its encoding and what it hashes
  // are not documented, and other inbound media is not checked either.
  const media = await downloadFlowMedia(entry.id, limit, request)
  if (!budget.consume(media.bytes.byteLength)) {
    throw new FlowMediaFailure("too_large")
  }
  const fields = toStoredMediaFields(
    await storeMedia(ctx, entry, media, request.deadlineAt),
  )
  const fileName = toDisplayName(entry.fileName)
  return {
    file: {
      status: "stored",
      mediaId: entry.id,
      fileName,
      mimeType: fields.mimeType,
      size: fields.size,
    },
    attachment: {
      sourceId: entry.id,
      fileType: toFileType(fields.mimeType),
      name: fileName,
      ...fields,
    },
  }
}

/** Never throws: a file that cannot be kept becomes a `failed` entry. */
const ingestEntry = async (
  entry: FlowMediaEntry,
  context: IngestContext,
): Promise<FlowMediaOutcome> => {
  // A type outside the list is refused before any request.
  if (!isAllowedMimeType(entry.mimeType)) {
    return failedOutcome(entry, "unsupported_type")
  }
  try {
    // Waiting for a slot is held to the response's deadline too.
    return await runWithFileSlot(() => keepEntry(entry, context), {
      signal: AbortSignal.timeout(
        Math.max(0, context.request.deadlineAt - Date.now()),
      ),
    })
  } catch (error) {
    const reason =
      error instanceof FlowMediaFailure ? error.reason : "download_failed"
    logger.warn(
      { err: error, mediaId: entry.id, reason },
      "Unable to keep WhatsApp Flow media",
    )
    return failedOutcome(entry, reason)
  }
}

/** Each media id once, first occurrence wins: a repeated id is one file. */
const uniqueEntries = (groups: FlowMediaGroup[]): FlowMediaEntry[] => {
  const byId = new Map<string, FlowMediaEntry>()
  for (const { entries } of groups) {
    for (const entry of entries) {
      if (!byId.has(entry.id)) {
        byId.set(entry.id, entry)
      }
    }
  }
  return [...byId.values()]
}

/** Every entry's outcome, in order; `ingestEntry` itself never rejects. */
const ingestEntries = async (
  entries: FlowMediaEntry[],
  context: IngestContext,
): Promise<FlowMediaOutcome[]> =>
  (
    await mapWithConcurrency(entries, context.policy.concurrency, (entry) =>
      ingestEntry(entry, context),
    )
  ).map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : failedOutcome(entries[index] as FlowMediaEntry, "download_failed"),
  )

/** One response's shared state: its byte budget, deadline and Graph access. */
const createIngestContext = (
  ctx: FlowMediaContext,
  policy: FlowMediaPolicy,
  phoneNumberId: string,
): IngestContext => ({
  ctx,
  policy,
  budget: new ByteBudget(policy.maxTotalBytes),
  request: {
    accessToken: ctx.auth.tokens.accessToken,
    version: ctx.auth.version ?? DEFAULT_API_VERSION,
    phoneNumberId,
    deadlineAt: Date.now() + policy.deadlineMs,
    requestTimeoutMs: policy.requestTimeoutMs,
    maxAttempts: policy.maxAttempts,
    retryDelayMs: policy.retryDelayMs,
  },
})

/** Fetches, checks and stores every file of a response, within Meta's limits. */
export const ingestFlowMedia = async (
  ctx: FlowMediaContext,
  groups: FlowMediaGroup[],
  policy: FlowMediaPolicy = DEFAULT_FLOW_MEDIA_POLICY,
): Promise<{
  files: Record<string, FlowResponseFile[]>
  attachments: IncomingAttachment[]
}> => {
  const entries = uniqueEntries(groups)
  const accepted = entries.slice(0, policy.maxFiles)
  // The media id comes from the customer's reply; only `phone_number_id`
  // makes Meta refuse media of another number, so without it nothing is
  // fetched.
  const phoneNumberId = asString(ctx.integrationDetail?.phoneNumberId)
  if (!phoneNumberId) {
    logger.warn(
      { files: accepted.length },
      "WhatsApp Flow files not downloaded: the receiving phone number is unknown",
    )
  }
  const acceptedOutcomes = phoneNumberId
    ? await ingestEntries(
        accepted,
        createIngestContext(ctx, policy, phoneNumberId),
      )
    : accepted.map((entry) => failedOutcome(entry, "download_failed"))
  // A file past Meta's count is never fetched.
  const outcomeById = new Map<string, FlowMediaOutcome>(
    entries.map((entry, index) => [
      entry.id,
      acceptedOutcomes[index] ?? failedOutcome(entry, "too_large"),
    ]),
  )

  // A Map, not an object literal: a response key such as `__proto__` must stay
  // a plain entry.
  const filesByKey = new Map<string, FlowResponseFile[]>()
  for (const { key, entries: groupEntries } of groups) {
    filesByKey.set(
      key,
      groupEntries.flatMap((entry) => {
        const outcome = outcomeById.get(entry.id)
        return outcome ? [outcome.file] : []
      }),
    )
  }
  const attachments = [...outcomeById.values()].flatMap(({ attachment }) =>
    attachment ? [attachment] : [],
  )
  return { files: Object.fromEntries(filesByKey), attachments }
}

/**
 * Files a customer attached to a WhatsApp Flow answer (PhotoPicker /
 * DocumentPicker). Without an endpoint, Meta puts only
 * `{ id, file_name, mime_type, sha256 }` in `nfm_reply.response_json` and does
 * not say how long it keeps the file, so the bytes are fetched here at once
 * with the media id (Meta's "download media" steps) and stored like any other
 * inbound media. Returns the same response with `files` (the channel-agnostic
 * `FlowResponseFile` of each one) plus one attachment per stored file, so they
 * are kept, shown and purged like any inbound media. Empty when the reply is
 * not a Flow response or carries no files.
 */
export const readFlowResponseMedia = async (
  ctx: FlowMediaContext,
  contentAttributes: IncomingMessage["contentAttributes"],
): Promise<
  Pick<IncomingMessageFragment, "contentAttributes" | "attachments">
> => {
  const flowResponse = getWhatsappFlowResponse(contentAttributes)
  if (!flowResponse) {
    return {}
  }
  const groups = extractFlowMediaGroups(flowResponse.flowResponse)
  if (groups.length === 0) {
    return {}
  }
  const { files, attachments } = await ingestFlowMedia(ctx, groups)
  const withFiles: MessageWhatsappFlowResponseEntity = {
    ...flowResponse,
    files,
  }
  return {
    contentAttributes: withFiles,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}
