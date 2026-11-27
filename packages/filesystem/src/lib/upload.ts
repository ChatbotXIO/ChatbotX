import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { getChildLogger } from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { fetchFollowingSafeRedirects, readBodyWithLimit } from "./bounded-fetch"
import { getImageDimensions, pathJoin } from "./helper"
import { normalizeMimeType } from "./mime-type"
import { DEFAULT_MIME_TYPE, type UploadedFile } from "./schema"
import { uploader } from "./uploader"

const logger = getChildLogger("filesystem:upload")

/**
 * Distinguishes a caller-fault upload failure (oversized body, unreachable
 * URL, too many redirects, SSRF rejection) from an infrastructure failure
 * (storage outage, network error) — callers like
 * `packages/business/src/ai-file/service.ts` need this to avoid surfacing
 * internal error text (e.g. "connect ECONNREFUSED ...") as a 400 to the
 * request's caller.
 */
export class UploadValidationError extends Error {
  /**
   * Stable machine-readable cause (e.g. `"fileTooLarge"`), so a caller can
   * localize the failure without parsing `message`. Optional: callers that
   * never set it keep working unchanged.
   */
  readonly reason?: string

  constructor(message: string, reason?: string) {
    super(message)
    this.name = "UploadValidationError"
    this.reason = reason
  }
}

/**
 * Inspects the final response (after every redirect) before its body is read
 * or stored. Throw to reject; return `mimeType`/`name` to override what is
 * stored and returned.
 */
export type UploadResponseValidator = (input: {
  finalUrl: string
  mimeType: string
  contentDisposition: string | null
  contentLength: number | null
}) =>
  | Promise<{ mimeType?: string; name?: string }>
  | { mimeType?: string; name?: string }

export async function uploadFile(
  file: File,
  path: string,
  acl = "public-read",
): Promise<UploadedFile> {
  const buffer = (await file.arrayBuffer()) as unknown as Buffer
  const mimeType = normalizeMimeType(file.type)
  await uploader.putObject(path, buffer, {
    ACL: acl as ObjectCannedACL,
    ContentLength: file.size,
    ContentType: mimeType,
  })

  const imageDimensions = await getImageDimensions(mimeType, buffer)

  return {
    name: file.name,
    originPath: path,
    size: file.size,
    ...imageDimensions,
  }
}

export async function uploadMultipleFiles(
  files: File[],
  prefix: string,
  acl = "public-read",
): Promise<UploadedFile[]> {
  return await Promise.all(
    files.map((file) => uploadFile(file, pathJoin(prefix, createId()), acl)),
  )
}

export async function uploadFileFromUrl(
  url: string,
  path: string,
  acl = "public-read",
  maxBytes?: number,
  validateUrl?: (url: string) => Promise<void>,
  signal?: AbortSignal,
  validateResponse?: UploadResponseValidator,
): Promise<UploadedFile> {
  const { response, finalUrl } = validateUrl
    ? await fetchFollowingSafeRedirects({
        errors: {
          tooManyRedirects: () =>
            new UploadValidationError(
              "Too many redirects while downloading file",
              "tooManyRedirects",
            ),
          noLocationHeader: () =>
            new UploadValidationError(
              "Redirect response has no Location header",
              "invalidRedirect",
            ),
          // The Location value is attacker-controlled and may carry tokens:
          // never echo it into a message that can reach an API response.
          invalidRedirectLocation: () =>
            new UploadValidationError(
              "Redirect response has an invalid Location header",
              "invalidRedirect",
            ),
        },
        fetchImpl: (candidateUrl) =>
          fetch(candidateUrl, { redirect: "manual" as const, signal }),
        url,
        validateUrl,
      })
    : {
        response: await fetch(url, { redirect: "follow" as const, signal }),
        finalUrl: url,
      }
  if (!response.ok) {
    throw new UploadValidationError(
      `Failed to download file: ${response.status}`,
      "downloadFailed",
    )
  }

  const headerMimeType = normalizeMimeType(
    (response.headers.get("content-type") || DEFAULT_MIME_TYPE).split(";")[0],
  )
  const headerLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )
  if (maxBytes !== undefined && headerLength > maxBytes) {
    throw new UploadValidationError(
      `File exceeds the maximum allowed size of ${maxBytes} bytes`,
      "fileTooLarge",
    )
  }

  const overrides = validateResponse
    ? await validateResponse({
        finalUrl,
        mimeType: headerMimeType,
        contentDisposition: response.headers.get("content-disposition"),
        contentLength:
          Number.isFinite(headerLength) && headerLength > 0
            ? headerLength
            : null,
      })
    : {}
  const mimeType = overrides.mimeType ?? headerMimeType

  let name = createId()
  try {
    const u = new URL(finalUrl)
    const last = u.pathname.split("/").pop() ?? ""
    if (last) {
      name = decodeURIComponent(last)
    }
  } catch (error) {
    logger.warn({ err: error }, "uploadFileFromUrl: invalid URL")
  }

  const buffer =
    maxBytes === undefined
      ? Buffer.from(await response.arrayBuffer())
      : await readBodyWithLimit(
          response,
          maxBytes,
          (limit) =>
            new UploadValidationError(
              `File exceeds the maximum allowed size of ${limit} bytes`,
              "fileTooLarge",
            ),
        )
  // headerLength is the origin's self-reported content-length, used only as
  // an early-reject hint above — it can disagree with what was actually
  // streamed, and putObject's ContentLength must match the real buffer.
  const size = buffer.byteLength

  await uploader.putObject(
    path,
    buffer,
    {
      ACL: acl as ObjectCannedACL,
      ContentType: mimeType,
      ContentLength: size,
    },
    // Bound the S3 upload by the same deadline as the download, so a stalled
    // put cannot hold the caller (e.g. inline comment ingestion) past budget.
    signal,
  )

  const imageDimensions = await getImageDimensions(mimeType, buffer)

  return {
    name: overrides.name ?? name,
    originPath: path,
    size,
    ...imageDimensions,
  }
}
