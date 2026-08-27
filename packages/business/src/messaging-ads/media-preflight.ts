import {
  isStoredImageMedia,
  type MessagingAdCreativeMediaInput,
} from "@chatbotx.io/database/partials"
import { fileRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import {
  buildMessagingAdCreativeStoragePrefix,
  MAX_MESSAGING_AD_IMAGE_BYTES,
  MESSAGING_AD_CREATIVE_UPLOAD_KIND,
  type MessagingAdImageMimeType,
} from "@chatbotx.io/integration-facebook-ads"
import { imageSize } from "image-size"
import { ChatbotXException } from "../errors"

export type ResolvedStoredImage = {
  bytes: Uint8Array
  mimeType: MessagingAdImageMimeType
  fileName: string
}

/** Magic-byte format (`image-size`'s sniffed `type`) -> the canonical allowlisted MIME + safe extension — never the client-declared `imageMimeType`/`imageFileName`. */
const SNIFFED_IMAGE_FORMAT: Record<
  string,
  { mimeType: MessagingAdImageMimeType; extension: string }
> = {
  jpg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  gif: { mimeType: "image/gif", extension: "gif" },
  webp: { mimeType: "image/webp", extension: "webp" },
}

function rejectPreflight(message: string): never {
  throw new ChatbotXException(message, "invalidRequest", 400)
}

/**
 * Reads a stream into a Buffer while enforcing a hard byte cap — destroys the
 * stream and rejects the moment the cap is crossed. `headObject` already
 * size-gates the common case, but the presigned PUT stays valid for minutes and
 * the key could be overwritten with a larger object between HEAD and GET
 * (TOCTOU); this makes the read itself bounded so a swapped-in giant object can
 * never be buffered whole into builder memory.
 */
// The S3 object body stream — derived from the uploader's own return type so
// this Edge-safety-audited business file never names `node:stream` directly.
type ObjectBodyStream = Awaited<
  ReturnType<typeof uploader.getObjectStream>
>["stream"]

function readStreamBounded(
  stream: ObjectBodyStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        stream.destroy()
        reject(
          new ChatbotXException(
            "This image exceeds the maximum allowed size.",
            "invalidRequest",
            400,
          ),
        )
        return
      }
      chunks.push(chunk)
    })
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * Bounded, ownership-verified read-back of a stored-image creative's bytes —
 * called ONCE at the very start of `runCreateSteps()` (before `ensureCampaign`,
 * the first Graph POST) so a forged/foreign/oversized/non-image key fails the
 * whole operation with ZERO Meta calls. Never trusts the client-declared
 * `imageMimeType`/`imageFileName` — the authoritative MIME + a
 * server-generated filename are derived from the bytes themselves.
 *
 * Order matters: `headObject` (size only) runs BEFORE `getObject` (buffers
 * the whole object) so a forged oversized upload is rejected without ever
 * being pulled into builder memory.
 */
export async function resolveStoredImageBytes(input: {
  workspaceId: string
  media: MessagingAdCreativeMediaInput
}): Promise<ResolvedStoredImage> {
  if (!isStoredImageMedia(input.media)) {
    throw new Error(
      "resolveStoredImageBytes called for a non-stored-image media input",
    )
  }
  const { imageKey, fileId } = input.media

  // 1. The key must live inside THIS workspace's ads-creative namespace.
  const prefix = `${buildMessagingAdCreativeStoragePrefix(input.workspaceId)}/`
  if (!imageKey.startsWith(prefix)) {
    rejectPreflight("This image is not owned by this workspace.")
  }

  // 2. Ownership proof: the `File` row must exist, belong to this workspace,
  // point at the SAME key, and have been minted for an ads-creative upload.
  // "A workspace File row exists" alone is too weak.
  const file = await fileRepository.findByIdForWorkspace({
    id: fileId,
    workspaceId: input.workspaceId,
  })
  if (
    !file ||
    file.path !== imageKey ||
    file.subType !== MESSAGING_AD_CREATIVE_UPLOAD_KIND
  ) {
    rejectPreflight("This image upload could not be verified.")
  }

  // 3. HEAD before GET — reject an oversized (or missing/never-uploaded)
  // object before buffering it.
  let contentLength: number | undefined
  try {
    const head = await uploader.headObject(imageKey)
    contentLength = head.ContentLength
  } catch {
    rejectPreflight("This image could not be found in storage.")
  }
  if (!contentLength || contentLength > MAX_MESSAGING_AD_IMAGE_BYTES) {
    rejectPreflight("This image exceeds the maximum allowed size.")
  }

  // 4. Bounded GET (hard cap during the read — see `readStreamBounded`), then
  // sniff the REAL bytes.
  const { stream } = await uploader.getObjectStream(imageKey)
  const buffer = await readStreamBounded(stream, MAX_MESSAGING_AD_IMAGE_BYTES)
  let sniffedType: string | undefined
  try {
    sniffedType = imageSize(new Uint8Array(buffer)).type
  } catch {
    rejectPreflight("This file is not a supported image.")
  }
  const format = sniffedType ? SNIFFED_IMAGE_FORMAT[sniffedType] : undefined
  if (!format) {
    rejectPreflight("This file is not a supported image.")
  }

  return {
    bytes: new Uint8Array(buffer),
    mimeType: format.mimeType,
    fileName: `${fileId}.${format.extension}`,
  }
}
