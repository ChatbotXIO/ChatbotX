import { PassThrough, Readable } from "node:stream"
import type { ReadableStream } from "node:stream/web"
import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { env as dbEnv } from "@chatbotx.io/database/keys"
import { createId } from "@chatbotx.io/utils"
import ky from "ky"
import probe from "probe-image-size"
import { guessFileTypeFromMimeType } from "./helper"
import { DEFAULT_MIME_TYPE, type UploadedFile } from "./schema"
import { uploader } from "./uploader"

export async function getUploadedFileFromUrl(
  url: string,
): Promise<UploadedFile> {
  const response = await ky.head(url)
  if (!response.ok) {
    throw new Error(`Failed to head file: ${response.status}`)
  }

  const mimeType = (response.headers.get("content-type") || DEFAULT_MIME_TYPE)
    .split(";")[0]
    .trim()
  const contentLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )

  const u = new URL(url)
  const assetUrl = new URL(dbEnv.NEXT_PUBLIC_ASSET_URL)
  const originPath = decodeURIComponent(
    u.pathname.replace(assetUrl.pathname, ""),
  )
  const name = originPath.split("/").pop() ?? createId()

  const isImage = mimeType.startsWith("image/")
  let width: number | undefined
  let height: number | undefined

  if (isImage) {
    try {
      const dimensions = await probe(url)
      width = dimensions.width
      height = dimensions.height
    } catch (error) {
      console.error(
        "[getUploadedFileFromUrl] Failed to probe image dimensions",
        error,
      )
    }
  }

  return {
    name,
    mimeType,
    originPath,
    size: contentLength,
    fileType: guessFileTypeFromMimeType(mimeType),
    width,
    height,
  }
}

export async function uploadFileFromUrl(
  url: string,
  path: string,
  acl = "public-read",
): Promise<UploadedFile> {
  const response = await fetch(url, { redirect: "follow" as const })
  if (!(response.ok && response.body)) {
    throw new Error(`Failed to download file: ${response.status}`)
  }

  const mimeType = (response.headers.get("content-type") || DEFAULT_MIME_TYPE)
    .split(";")[0]
    .trim()
  const contentLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  )
  const isImage = mimeType.startsWith("image/")

  const nodeStream = Readable.fromWeb(
    response.body as unknown as ReadableStream<Uint8Array>,
  )

  // Detect filename from URL if possible
  let name = createId()
  try {
    const u = new URL(url)
    const last = u.pathname.split("/").pop() ?? ""
    if (last) {
      name = decodeURIComponent(last)
    }
  } catch (error) {
    console.error("error", error)
    // safe return
  }

  if (isImage) {
    // For images: split the stream to probe dimensions in parallel with the S3 upload
    const s3Stream = new PassThrough()
    const probeStream = new PassThrough()
    nodeStream.pipe(s3Stream)
    nodeStream.pipe(probeStream)

    const upload = uploader.putObject(path, s3Stream, {
      ACL: acl as ObjectCannedACL,
      ContentType: mimeType,
      ContentLength: contentLength,
    })

    const [dimensions] = await Promise.all([probe(probeStream), upload])

    return {
      name,
      mimeType: dimensions.mime ?? mimeType,
      originPath: path,
      size: contentLength,
      fileType: guessFileTypeFromMimeType(dimensions.mime ?? mimeType),
      width: dimensions.width,
      height: dimensions.height,
    }
  }

  // For non-image files (video, audio, documents): upload directly without probing
  await uploader.putObject(path, nodeStream, {
    ACL: acl as ObjectCannedACL,
    ContentType: mimeType,
    ContentLength: contentLength,
  })

  return {
    name,
    mimeType,
    originPath: path,
    size: contentLength,
    fileType: guessFileTypeFromMimeType(mimeType),
  }
}
