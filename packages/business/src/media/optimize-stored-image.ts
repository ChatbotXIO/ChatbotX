import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import {
  optimizeImageForStorage,
  readImageDimensions,
} from "@chatbotx.io/utils/image-optimize"
import {
  getImageOptimizationSettings,
  isStoredImageOptimizationEnabled,
} from "@chatbotx.io/utils/image-optimize-settings"
import {
  isStoredImageOptimizationTarget,
  type StoredImageOptimization,
} from "@chatbotx.io/worker-config"
import { contactService } from "../contact/service"
import { updateAttachmentOrThrow } from "./attachment-row"

/**
 * Server-only (pulls in sharp): imported by the heavy worker through the
 * `@chatbotx.io/business/media/optimize-stored-image` subpath, never the
 * package barrel, so request-serving processes do not load the native addon.
 *
 * Re-encodes an already stored image off the hot path. The object is
 * overwritten under the same key, so every URL already handed out (inbox,
 * flows, custom fields, outbound sends) keeps working; an attachment then gets
 * metadata describing the new bytes. Nothing is written unless the attachment
 * or contact still points at the key, re-checked after the encode.
 */
export type StoredImageOptimizationOutcome =
  | "optimized"
  | "unchanged"
  // The object was already re-encoded by an earlier attempt whose row update
  // failed; only the row was repaired.
  | "reconciled"
  | "skipped-stale"
  | "skipped-large"
  | "skipped-small"
  | "skipped-foreign"
  | "skipped-original"
  | "disabled"

export type StoredImageOptimizationResult = {
  outcome: StoredImageOptimizationOutcome
  /** Source and stored object sizes; present once the source was read. */
  bytesBefore?: number
  bytesAfter?: number
}

const PUBLIC_STORAGE_PREFIX = "public/"

const isNotFound = (err: unknown) =>
  err instanceof Error && (err.name === "NotFound" || err.name === "NoSuchKey")

type ReferencedRow = {
  // Only an attachment can carry the sender's "sent as a file" intent.
  keepOriginal: boolean | null
  // What the attachment row says the object is; null for an avatar (the
  // contact row keeps no metadata about it).
  stored: { mimeType: string; size: number } | null
}

// The row that still points at the job's key, or null when nothing does.
const findReferencedRow = async (
  job: StoredImageOptimization,
): Promise<ReferencedRow | null> => {
  if (job.kind === "avatar") {
    const contact = await contactService.findById({
      workspaceId: job.workspaceId,
      id: job.contactId,
    })
    return contact?.avatar === job.objectKey
      ? { keepOriginal: null, stored: null }
      : null
  }

  const repository = await createMessageRepository()
  const attachment = await repository.findAttachmentById({
    id: job.attachmentId,
    workspaceId: job.workspaceId,
    ...(job.messageCreatedAt
      ? { messageCreatedAt: new Date(job.messageCreatedAt) }
      : {}),
  })
  return attachment?.originPath === job.objectKey
    ? {
        keepOriginal: attachment.keepOriginal ?? null,
        stored: { mimeType: attachment.mimeType, size: attachment.size },
      }
    : null
}

export async function optimizeStoredImage(
  job: StoredImageOptimization,
): Promise<StoredImageOptimizationResult> {
  // A job queued before the switch was flipped must not write.
  if (!isStoredImageOptimizationEnabled()) {
    return { outcome: "disabled" }
  }
  // The enqueue already filters these; re-checked here so a crafted
  // `Contact.avatar` can never make this job overwrite another tenant's
  // object, or a non-avatar object of its own workspace.
  if (!isStoredImageOptimizationTarget(job)) {
    return { outcome: "skipped-foreign" }
  }
  const referenced = await findReferencedRow(job)
  if (!referenced) {
    return { outcome: "skipped-stale" }
  }
  if (referenced.keepOriginal === true) {
    return { outcome: "skipped-original" }
  }

  let head: Awaited<ReturnType<typeof uploader.headObject>>
  try {
    head = await uploader.headObject(job.objectKey)
  } catch (err) {
    if (isNotFound(err)) {
      return { outcome: "skipped-stale" }
    }
    throw err
  }
  // The ceiling bounds the download and decode for one job (larger sources
  // stay as-is). Under the floor an attachment is not worth a download, an
  // encode and a write (a sticker, a tiny thumbnail); avatars are exempt, and
  // an unreported length is not a small object.
  const { minSourceBytes, maxSourceBytes } = getImageOptimizationSettings().job
  if ((head.ContentLength ?? 0) > maxSourceBytes) {
    return { outcome: "skipped-large" }
  }
  if (
    job.kind === "attachment" &&
    head.ContentLength !== undefined &&
    head.ContentLength < minSourceBytes &&
    // A row whose size disagrees with the object is a previous attempt that
    // overwrote it and lost the update: fall through so it gets reconciled.
    (referenced.stored === null ||
      referenced.stored.size === head.ContentLength)
  ) {
    return { outcome: "skipped-small" }
  }

  const source = await uploader.getObject(job.objectKey)
  const bytesBefore = source.length
  const result = await optimizeImageForStorage({
    bytes: source,
    mimeType: head.ContentType ?? "application/octet-stream",
    profile: job.kind === "avatar" ? "avatar" : "media",
  })
  if (!result.optimized) {
    // A previous attempt may have overwritten the object and then failed to
    // update the row (BullMQ retries the whole job). The re-encode of an
    // already-compressed object rarely saves enough to run again, so repair
    // the row from the stored object here or its metadata stays wrong forever.
    const storedMimeType = head.ContentType ?? referenced.stored?.mimeType
    if (
      job.kind === "attachment" &&
      referenced.stored &&
      storedMimeType &&
      (referenced.stored.mimeType !== storedMimeType ||
        referenced.stored.size !== bytesBefore)
    ) {
      const [repository, dimensions] = await Promise.all([
        createMessageRepository(),
        readImageDimensions(source),
      ])
      await updateAttachmentOrThrow(repository, {
        id: job.attachmentId,
        workspaceId: job.workspaceId,
        createdAt: new Date(job.attachmentCreatedAt),
        fields: {
          originPath: job.objectKey,
          mimeType: storedMimeType,
          size: bytesBefore,
          // An EXIF-rotated photo swaps its aspect ratio when re-encoded.
          ...(dimensions?.width && dimensions.height
            ? { width: dimensions.width, height: dimensions.height }
            : {}),
        },
      })
      return { outcome: "reconciled", bytesBefore, bytesAfter: bytesBefore }
    }
    return { outcome: "unchanged", bytesBefore, bytesAfter: bytesBefore }
  }

  // The encode takes time: a refresh may have replaced the avatar or the
  // attachment may have moved, so never write over a key nothing points at.
  if (!(await findReferencedRow(job))) {
    return { outcome: "skipped-stale" }
  }

  // Overwriting must keep the key's access level, or public URLs already
  // handed out for it would start returning 403.
  await uploader.putObject(job.objectKey, result.bytes, {
    ...(job.objectKey.startsWith(PUBLIC_STORAGE_PREFIX)
      ? { ACL: "public-read" as const }
      : {}),
    ContentType: result.mimeType,
    ContentLength: result.bytes.length,
  })

  if (job.kind === "attachment") {
    const repository = await createMessageRepository()
    await updateAttachmentOrThrow(repository, {
      id: job.attachmentId,
      workspaceId: job.workspaceId,
      createdAt: new Date(job.attachmentCreatedAt),
      fields: {
        // Same key: the object was overwritten in place.
        originPath: job.objectKey,
        mimeType: result.mimeType,
        size: result.bytes.length,
        width: result.width,
        height: result.height,
      },
    })
  }

  return { outcome: "optimized", bytesBefore, bytesAfter: result.bytes.length }
}
