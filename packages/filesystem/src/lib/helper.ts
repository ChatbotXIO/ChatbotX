import path from "node:path"
import { PassThrough, Readable } from "node:stream"
import type { ReadableStream } from "node:stream/web"
import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import probe from "probe-image-size"
import { uploaderLogger } from "./logger"
import { uploader } from "./uploader"

const DEFAULT_MIME_TYPE = "application/octet-stream"

export type UploadedFile = {
  name: string
  mimeType: string
  originPath: string
  size: number
  fileType: "image" | "video" | "audio" | "file"
  width?: number
  height?: number
}

export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
      return "image"
    case "video":
      return "video"
    case "audio":
      return "audio"
    default:
      return "file"
  }
}

async function getImageDimensions(mimeType: string, buffer: Buffer) {
  const imageDimensions: Pick<
    UploadedFile,
    "mimeType" | "fileType" | "width" | "height"
  > = {
    mimeType,
    fileType: guessFileTypeFromMimeType(mimeType),
  }
  if (mimeType.startsWith("image/")) {
    // try to find image dimensions
    try {
      const { width, height } = await imageSize(new Uint8Array(buffer))
      imageDimensions.width = width
      imageDimensions.height = height
    } catch (error) {
      uploaderLogger.warn(error, "Unable to retrieve image dimensions")

      // force image to file
      imageDimensions.fileType = "file"
      imageDimensions.mimeType = "application/octet-stream"
    }
  }

  return imageDimensions
}

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
    files.map((file) => uploadFile(file, path.join(prefix, createId()), acl)),
  )
}

export async function uploadFileFromUrl(
  url: string,
  path: string,
  acl = "public-read",
): Promise<UploadedFile> {
  const response = await fetch(url, { redirect: "follow" as const })
  if (!(response.ok && response.body)) {
    throw new Error(`Failed to download image: ${response.status}`)
  }

  const nodeStream = Readable.fromWeb(
    response.body as unknown as ReadableStream<Uint8Array>,
  )

  // 1. Create two PassThrough streams to "split" the incoming data
  const s3Stream = new PassThrough()
  const probeStream = new PassThrough()
  nodeStream.pipe(s3Stream)
  nodeStream.pipe(probeStream)

  // 2. Start the S3 Upload immediately
  const upload = uploader.putObject(path, s3Stream, {
    ACL: acl as ObjectCannedACL,
    ContentType: response.headers.get("content-type") || DEFAULT_MIME_TYPE,
    ContentLength: Number.parseInt(
      response.headers.get("content-length") ?? "0",
      10,
    ),
  })

  // 3. Probe the stream for dimensions simultaneously
  // probe() will resolve as soon as the first few KB are processed
  const dimensionsPromise = probe(probeStream)

  // Wait for both tasks to complete

  const [dimensions] = await Promise.all([dimensionsPromise, upload])
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

  return {
    name,
    mimeType: dimensions.mime,
    originPath: path,
    size: dimensions.length,
    fileType: guessFileTypeFromMimeType(dimensions.mime),
    width: dimensions.width,
    height: dimensions.height,
  }
}
