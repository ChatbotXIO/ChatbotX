import { PassThrough, Readable } from "node:stream"
import type { ReadableStream } from "node:stream/web"
import type { ObjectCannedACL } from "@aws-sdk/client-s3"
import { createId } from "@paralleldrive/cuid2"
import probe from "probe-image-size"
import { guessFileTypeFromMimeType } from "./helper"
import { DEFAULT_MIME_TYPE, type UploadedFile } from "./schema"
import { uploader } from "./uploader"

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
