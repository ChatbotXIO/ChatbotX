import type { SocialPublishFailed } from "@chatbotx.io/utils/social-publisher"
import { tiktokFailure } from "./publisher-api"

/**
 * Chunked FILE_UPLOAD of a video to the `upload_url` TikTok returns. The media
 * is read from its own URL one range at a time, so at most one chunk is ever in
 * memory (never the whole file).
 *
 * Rules (TikTok "Media Transfer Guide",
 * https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide):
 * a chunk is at least 5 MB and at most 64 MB, except the last one which absorbs
 * the trailing bytes (up to 128 MB); `total_chunk_count` is the file size
 * divided by the chunk size, rounded down; chunks go up sequentially with
 * `Content-Range`; 206 means more chunks are due, 201 means all arrived, 403 the
 * `upload_url` (valid one hour) expired, 416 the range does not match the
 * progress, 5xx is retryable.
 */

const MEGABYTE = 1024 * 1024
/** Between the 5 MB minimum and the 64 MB maximum; the last chunk is under twice this. */
export const UPLOAD_CHUNK_BYTES = 20 * MEGABYTE
const REQUEST_TIMEOUT_MS = 120_000
const CHUNK_RETRIES = 2
const HTTP_CREATED = 201
const HTTP_PARTIAL = 206
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_RANGE_NOT_SATISFIABLE = 416
const HTTP_SERVER_ERROR = 500

export type UploadChunk = { end: number; start: number }

export type UploadPlan = {
  chunkSize: number
  chunks: UploadChunk[]
}

/** How a file of `size` bytes is cut. A file up to one chunk goes whole. */
export const planUpload = (size: number): UploadPlan => {
  if (size <= UPLOAD_CHUNK_BYTES) {
    return { chunkSize: size, chunks: [{ end: size - 1, start: 0 }] }
  }
  const count = Math.floor(size / UPLOAD_CHUNK_BYTES)
  const chunks: UploadChunk[] = []
  for (let index = 0; index < count; index += 1) {
    const start = index * UPLOAD_CHUNK_BYTES
    chunks.push({
      end: index === count - 1 ? size - 1 : start + UPLOAD_CHUNK_BYTES - 1,
      start,
    })
  }
  return { chunkSize: UPLOAD_CHUNK_BYTES, chunks }
}

/** The byte size of the media file, from a HEAD request; `null` when it is not reported. */
export const readMediaSize = async (url: string): Promise<number | null> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const size = Number(response.headers.get("content-length"))
    return response.ok && Number.isInteger(size) && size > 0 ? size : null
  } catch {
    return null
  }
}

type ChunkBytes =
  | { bytes: Uint8Array<ArrayBuffer>; ok: true }
  | { failure: SocialPublishFailed; ok: false }

const readChunk = async (input: {
  chunk: UploadChunk
  mediaUrl: string
  size: number
}): Promise<ChunkBytes> => {
  const { chunk, mediaUrl, size } = input
  const expected = chunk.end - chunk.start + 1
  try {
    const response = await fetch(mediaUrl, {
      headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const isWholeFile = chunk.start === 0 && expected === size
    if (
      response.status !== HTTP_PARTIAL &&
      !(response.status === HTTP_OK && isWholeFile)
    ) {
      return {
        failure: tiktokFailure(
          "mediaInvalid",
          "source_range_unsupported",
          "The media storage did not answer the range request.",
          false,
        ),
        ok: false,
      }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength === expected
      ? { bytes, ok: true }
      : {
          failure: tiktokFailure(
            "mediaInvalid",
            "source_size_mismatch",
            "The media file changed while it was being uploaded.",
            false,
          ),
          ok: false,
        }
  } catch {
    return {
      failure: tiktokFailure(
        "networkError",
        "source_unreachable",
        "The media file could not be read.",
        false,
      ),
      ok: false,
    }
  }
}

type PutOutcome =
  | { done: boolean; ok: true }
  | { failure: SocialPublishFailed; ok: false }

const putChunk = async (input: {
  bytes: Uint8Array<ArrayBuffer>
  chunk: UploadChunk
  mimeType: string
  size: number
  uploadUrl: string
}): Promise<PutOutcome> => {
  const { chunk } = input
  let lastStatus = 0
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt += 1) {
    try {
      const response = await fetch(input.uploadUrl, {
        body: input.bytes,
        headers: {
          "Content-Range": `bytes ${chunk.start}-${chunk.end}/${input.size}`,
          "Content-Type": input.mimeType,
        },
        method: "PUT",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      lastStatus = response.status
      if (response.status === HTTP_CREATED) {
        return { done: true, ok: true }
      }
      if (response.status === HTTP_PARTIAL) {
        return { done: false, ok: true }
      }
      if (response.status < HTTP_SERVER_ERROR) {
        break
      }
    } catch {
      lastStatus = 0
    }
  }
  if (lastStatus === HTTP_FORBIDDEN) {
    return {
      failure: tiktokFailure(
        "mediaInvalid",
        "upload_url_expired",
        "The TikTok upload link expired before the upload finished.",
        false,
      ),
      ok: false,
    }
  }
  if (lastStatus === HTTP_RANGE_NOT_SATISFIABLE) {
    return {
      failure: tiktokFailure(
        "unknown",
        "upload_range_mismatch",
        "TikTok's upload progress does not match the bytes sent.",
        false,
      ),
      ok: false,
    }
  }
  // The chunk may or may not have arrived: not provably nothing happened.
  return {
    failure: tiktokFailure(
      "networkError",
      "upload_failed",
      "The upload to TikTok did not complete.",
      false,
    ),
    ok: false,
  }
}

export type UploadProgress =
  | { failure: SocialPublishFailed; kind: "failed" }
  | { kind: "complete" }
  | { kind: "partial"; offset: number }

/**
 * Sends the chunks from `offset` on, until the file is done or `budgetMs` ends
 * (the next call resumes at the returned offset).
 */
export const uploadChunks = async (input: {
  budgetMs: number
  mediaUrl: string
  mimeType: string
  offset: number
  size: number
  uploadUrl: string
}): Promise<UploadProgress> => {
  const startedAt = Date.now()
  const { chunks } = planUpload(input.size)
  const first = chunks.findIndex((chunk) => chunk.start === input.offset)
  if (first < 0) {
    return {
      failure: tiktokFailure(
        "unknown",
        "upload_offset_invalid",
        "The stored upload progress does not match a chunk boundary.",
        false,
      ),
      kind: "failed",
    }
  }
  let offset = input.offset
  for (const chunk of chunks.slice(first)) {
    if (Date.now() - startedAt >= input.budgetMs) {
      return { kind: "partial", offset }
    }
    const read = await readChunk({
      chunk,
      mediaUrl: input.mediaUrl,
      size: input.size,
    })
    if (!read.ok) {
      return { failure: read.failure, kind: "failed" }
    }
    const sent = await putChunk({
      bytes: read.bytes,
      chunk,
      mimeType: input.mimeType,
      size: input.size,
      uploadUrl: input.uploadUrl,
    })
    if (!sent.ok) {
      return { failure: sent.failure, kind: "failed" }
    }
    offset = chunk.end + 1
    if (sent.done) {
      return { kind: "complete" }
    }
  }
  // Every planned chunk was sent but TikTok never answered 201 Created (the
  // last answer was 206): the upload is not confirmed complete.
  return {
    failure: tiktokFailure(
      "networkError",
      "upload_not_confirmed",
      "TikTok did not confirm that the upload is complete.",
      false,
    ),
    kind: "failed",
  }
}
