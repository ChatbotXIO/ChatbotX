import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { createId } from "@chatbotx.io/utils"
import { getImageDimensions, pathJoin } from "./helper"
import { DEFAULT_MIME_TYPE, type UploadedFile } from "./schema"
import { uploader } from "./uploader"

export async function uploadFile(
  file: File,
  path: string,
  acl = "public-read",
): Promise<UploadedFile> {
  const buffer = (await file.arrayBuffer()) as unknown as Buffer
  await uploader.putObject(path, buffer, {
    ACL: acl as ObjectCannedACL,
    ContentLength: file.size,
    ContentType: file.type,
  })

  const imageDimensions = await getImageDimensions(file.type, buffer)

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

const MAX_REDIRECT_HOPS = 5

/**
 * Reads a response body through a stream with a running byte counter,
 * aborting as soon as `maxBytes` is crossed instead of buffering the whole
 * body first — a lying or absent `content-length` header must not force an
 * unbounded amount of the response into memory before the cap is enforced.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const body = response.body
  if (!body) {
    return Buffer.from(await response.arrayBuffer())
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(
        `File exceeds the maximum allowed size of ${maxBytes} bytes`,
      )
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks, total)
}

/**
 * Fetches `url`, manually following redirects so `validateUrl` re-runs on
 * every hop before it is requested — `fetch`'s own `redirect: "follow"`
 * would resolve and request each hop with zero re-validation, letting a
 * server that passes the first check redirect the download to a private/
 * internal address the caller's SSRF guard never saw.
 */
async function fetchFollowingSafeRedirects(
  url: string,
  validateUrl: (url: string) => Promise<void>,
  redirectsLeft = MAX_REDIRECT_HOPS,
): Promise<{ response: Response; finalUrl: string }> {
  await validateUrl(url)
  const response = await fetch(url, { redirect: "manual" as const })

  if (response.status < 300 || response.status >= 400) {
    return { response, finalUrl: url }
  }
  if (redirectsLeft <= 0) {
    throw new Error("Too many redirects while downloading file")
  }
  const location = response.headers.get("location")
  if (!location) {
    throw new Error("Redirect response has no Location header")
  }

  return fetchFollowingSafeRedirects(
    new URL(location, url).href,
    validateUrl,
    redirectsLeft - 1,
  )
}

export async function uploadFileFromUrl(
  url: string,
  path: string,
  acl = "public-read",
  maxBytes?: number,
  validateUrl?: (url: string) => Promise<void>,
): Promise<UploadedFile> {
  const { response, finalUrl } = validateUrl
    ? await fetchFollowingSafeRedirects(url, validateUrl)
    : {
        response: await fetch(url, { redirect: "follow" as const }),
        finalUrl: url,
      }
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`)
  }

  const mimeType = (response.headers.get("content-type") || DEFAULT_MIME_TYPE)
    .split(";")[0]
    .trim()
  const headerLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )
  if (maxBytes && headerLength > maxBytes) {
    throw new Error(
      `File exceeds the maximum allowed size of ${maxBytes} bytes`,
    )
  }

  let name = createId()
  try {
    const u = new URL(finalUrl)
    const last = u.pathname.split("/").pop() ?? ""
    if (last) {
      name = decodeURIComponent(last)
    }
  } catch (error) {
    console.error("uploadFileFromUrl: invalid URL", error)
  }

  const buffer = maxBytes
    ? await readBodyWithLimit(response, maxBytes)
    : Buffer.from(await response.arrayBuffer())
  const size = headerLength || buffer.byteLength

  await uploader.putObject(path, buffer, {
    ACL: acl as ObjectCannedACL,
    ContentType: mimeType,
    ContentLength: size,
  })

  const imageDimensions = await getImageDimensions(mimeType, buffer)

  return {
    name,
    originPath: path,
    size,
    ...imageDimensions,
  }
}
