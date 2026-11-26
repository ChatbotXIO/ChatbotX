import { uploader } from "@chatbotx.io/filesystem"
import {
  FeedImageImportError,
  type FeedImageImporter,
} from "../social-post-feed/image-importer"
import {
  type GuardedGetFailure,
  guardedGet,
  readCapped,
  withHttpsUpgrade,
} from "./guarded-get"
import { FEED_IMAGE_MAX_BYTES, reencodeUntrustedImage } from "./safe-image"

/**
 * Node-only (undici, sharp). Not re-exported from the package index; registered
 * from the worker and the builder's route handlers (AGENTS.md invariant 25).
 */

const OK = 200
const MAX_REDIRECTS = 2

const tooLarge = (): FeedImageImportError =>
  new FeedImageImportError("tooLarge", "The picture is larger than 8 MB")

const failureOf = (failure: GuardedGetFailure): FeedImageImportError => {
  switch (failure) {
    case "notWeb":
      return new FeedImageImportError(
        "notHttps",
        "Only web addresses are imported",
      )
    case "blocked":
      return new FeedImageImportError(
        "blocked",
        "The picture address is not allowed",
      )
    case "timeout":
      return new FeedImageImportError("timeout", "The picture timed out")
    case "unreachable":
      return new FeedImageImportError(
        "unreachable",
        "The picture could not be reached",
      )
    case "noLocation":
      return new FeedImageImportError(
        "unreachable",
        "The picture redirects nowhere",
      )
    default:
      return new FeedImageImportError(
        "unreachable",
        "The picture redirects too often",
      )
  }
}

const fetchBytes = async (
  start: string,
  signal: AbortSignal,
): Promise<Buffer> => {
  const { response } = await guardedGet({
    fail: failureOf,
    headers: { accept: "image/*", "user-agent": "ChatbotX-feed-image/1.0" },
    maxRedirects: MAX_REDIRECTS,
    signal,
    start,
  })
  if (response.status !== OK) {
    await response.body?.cancel().catch(() => undefined)
    throw new FeedImageImportError(
      "unreachable",
      `The picture answered with status ${response.status}`,
    )
  }
  const declared = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )
  if (Number.isFinite(declared) && declared > FEED_IMAGE_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  try {
    return await readCapped(response, FEED_IMAGE_MAX_BYTES, tooLarge)
  } catch (error) {
    if (error instanceof FeedImageImportError) {
      throw error
    }
    throw new FeedImageImportError(
      signal.aborted ? "timeout" : "unreachable",
      "The picture could not be read",
    )
  }
}

/** Only a failure http could change is retried over http: a size or policy refusal would download the same thing twice. */
const canRetryOverHttp = (error: unknown): boolean =>
  !(
    error instanceof FeedImageImportError &&
    (error.code === "tooLarge" || error.code === "blocked")
  )

const downloadWithUpgrade = async (
  url: string,
  signal: AbortSignal,
): Promise<Buffer> =>
  await withHttpsUpgrade(
    url,
    (candidate) => fetchBytes(candidate, signal),
    canRetryOverHttp,
  )

const FILE_EXTENSION = /\.[a-z0-9]{1,5}$/i

const nameOf = (url: string, extension: string): string => {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? ""
    const stem = decodeURIComponent(last).replace(FILE_EXTENSION, "")
    return `${stem || "image"}.${extension}`
  } catch {
    return `image.${extension}`
  }
}

export const importFeedImage: FeedImageImporter = async (input) => {
  const bytes = await downloadWithUpgrade(input.url, input.signal)
  const image = await reencodeUntrustedImage(bytes)
  try {
    await uploader.putObject(input.path, image.bytes, {
      ContentType: image.mimeType,
    })
  } catch {
    throw new FeedImageImportError("storage", "The picture could not be stored")
  }
  return {
    height: image.height,
    mimeType: image.mimeType,
    name: nameOf(input.url, image.extension),
    size: image.bytes.length,
    width: image.width,
  }
}
