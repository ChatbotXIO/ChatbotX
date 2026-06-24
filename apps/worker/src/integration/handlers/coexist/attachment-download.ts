import { extname } from "node:path"

import { buildContext, type IntegrationContext } from "@chatbotx.io/business"
import { db, sql } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  getWhatsappClient,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { SdkException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type { IntegrationJobCoexistAttachmentDownload } from "@chatbotx.io/worker-config"
import imageSize from "image-size"
import { logger } from "../../../lib/logger"

/** `Attachment.originPath` carries a pending sentinel until the bytes land in
 *  object storage. Two shapes are emitted by the historical importers:
 *
 *  - `http(s)://…`           — Messenger Graph file URL (short-lived)
 *  - `wa-media:<mediaId>`    — WhatsApp Coexistence media-id (need extra hop)
 *
 *  Anything else is a finalized S3 path and the download has already completed.
 */
const WA_MEDIA_PREFIX = "wa-media:"

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/zip": "zip",
}

const getStorageExtension = (
  originPath: string,
  mimeType: string,
): string | undefined => {
  if (originPath.startsWith("http://") || originPath.startsWith("https://")) {
    try {
      const extension = extname(new URL(originPath).pathname)
      if (extension) {
        return extension.slice(1)
      }
    } catch {
      // Fall through to MIME-based inference below.
    }
  }

  return MIME_EXTENSION_MAP[mimeType] ?? ""
}

/** Maximum allowed attachment size in bytes (50 MiB). */
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

const isPendingOriginPath = (path: string): boolean =>
  path.startsWith("http://") ||
  path.startsWith("https://") ||
  path.startsWith(WA_MEDIA_PREFIX)

type DownloadedMedia = {
  bytes: ArrayBuffer
  mimeType: string
  size: number
}

/**
 * Read a response body into an ArrayBuffer while enforcing
 * MAX_ATTACHMENT_BYTES. Unlike `response.arrayBuffer()`, this streams and
 * aborts as soon as the cumulative size exceeds the cap, so an origin that
 * lies about (or omits) `content-length` cannot OOM the worker by sending an
 * unbounded body.
 */
const readBodyWithCap = async (
  response: Response,
  label: string,
): Promise<ArrayBuffer> => {
  const declaredHeader = response.headers.get("content-length")
  if (declaredHeader !== null) {
    const declared = Number.parseInt(declaredHeader, 10)
    if (!Number.isNaN(declared) && declared > MAX_ATTACHMENT_BYTES) {
      throw new SdkException(
        `[coexist-attachment] ${label} exceeds size limit: ${declared} bytes (max ${MAX_ATTACHMENT_BYTES})`,
      )
    }
  }

  const body = response.body
  if (!body) {
    throw new SdkException(`[coexist-attachment] ${label} has no response body`)
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
    if (total > MAX_ATTACHMENT_BYTES) {
      await reader.cancel()
      throw new SdkException(
        `[coexist-attachment] ${label} body exceeds size limit: >${MAX_ATTACHMENT_BYTES} bytes`,
      )
    }
    chunks.push(value)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

const downloadMessengerMedia = async (
  url: string,
  accessToken: string,
  fallbackMime: string,
): Promise<DownloadedMedia> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "node",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!(response.ok && response.body)) {
    throw new SdkException(
      `[coexist-attachment] Messenger fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await readBodyWithCap(response, "Messenger attachment")
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? fallbackMime,
    size: bytes.byteLength,
  }
}

const downloadWhatsappMedia = async (
  mediaId: string,
  ctx: IntegrationContext<WhatsappAuthValue>,
  fallbackMime: string,
): Promise<DownloadedMedia> => {
  const client = getWhatsappClient(ctx.auth)
  const meta = await client.retrieveMedia(mediaId)
  if (!("url" in meta && "mime_type" in meta)) {
    throw new SdkException(
      `[coexist-attachment] WhatsApp retrieveMedia returned no url for ${mediaId}`,
    )
  }
  const response = await fetch(meta.url, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!(response.ok && response.body)) {
    throw new SdkException(
      `[coexist-attachment] WhatsApp media fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await readBodyWithCap(response, "WhatsApp attachment")
  return {
    bytes,
    mimeType: meta.mime_type ?? fallbackMime,
    size: bytes.byteLength,
  }
}

const loadIntegrationRow = async (
  channel: "messenger" | "whatsapp",
  integrationId: string,
): Promise<{ id: string; inboxId: string; auth: unknown } | null> => {
  const table =
    channel === "messenger" ? "IntegrationMessenger" : "IntegrationWhatsapp"
  const result = await db.execute<{
    id: string
    inboxId: string
    auth: unknown
  }>(
    sql`SELECT "id", "inboxId", "auth" FROM ${sql.identifier(table)} WHERE "id" = ${integrationId} LIMIT 1`,
  )
  return result.rows[0] ?? null
}

/**
 * Mirror a Coexist historical attachment's bytes to object storage and
 * persist the resulting path on the `Attachment` row.
 *
 * Two pending shapes are handled (see `isPendingOriginPath`); finalized S3
 * paths short-circuit so retries are no-ops. The UPDATE uses `WHERE id` only
 * — BullMQ `jobId: att-<id>` dedup plus this prefix guard cover idempotency.
 */
export const coexistAttachmentDownload = async (
  data: IntegrationJobCoexistAttachmentDownload["data"],
): Promise<void> => {
  const { attachmentId, workspaceId, channel, integrationId } = data

  const repo = await createMessageRepository(db)
  const row = await repo.findAttachmentById({
    id: attachmentId,
    workspaceId,
  })

  if (!row) {
    logger.warn({ attachmentId }, "[coexist-attachment] row missing — skip")
    return
  }
  if (!isPendingOriginPath(row.originPath)) {
    return
  }

  const integrationRow = await loadIntegrationRow(channel, integrationId)
  if (!integrationRow) {
    logger.warn(
      { channel, integrationId },
      "[coexist-attachment] integration row missing — skip",
    )
    return
  }

  const ctx = await buildContext({
    workspaceId,
    integrationType: channel,
    integration: integrationRow as Parameters<
      typeof buildContext
    >[0]["integration"],
  })

  let media: DownloadedMedia
  try {
    if (channel === "whatsapp") {
      const mediaId = row.originPath.slice(WA_MEDIA_PREFIX.length)
      media = await downloadWhatsappMedia(
        mediaId,
        ctx as unknown as IntegrationContext<WhatsappAuthValue>,
        row.mimeType,
      )
    } else {
      const accessToken = (ctx.auth as { tokens: { accessToken: string } })
        .tokens.accessToken
      media = await downloadMessengerMedia(
        row.originPath,
        accessToken,
        row.mimeType,
      )
    }
  } catch (error) {
    logger.error(
      { error, attachmentId, channel },
      "[coexist-attachment] download failed",
    )
    throw error
  }

  const extension = getStorageExtension(row.originPath, media.mimeType)
  const newOriginPath = `workspace/${ctx.storagePrefix}/${createId()}${extension ? `.${extension}` : ""}`

  await ctx.uploader?.putObject(newOriginPath, Buffer.from(media.bytes), {
    ContentLength: media.size,
    ContentType: media.mimeType,
  })

  let width: number | undefined
  let height: number | undefined
  if (media.mimeType.startsWith("image/")) {
    try {
      const dims = imageSize(new Uint8Array(media.bytes))
      width = dims.width
      height = dims.height
    } catch (error) {
      logger.warn(
        { error, attachmentId },
        "[coexist-attachment] imageSize failed — skipping dimensions",
      )
    }
  }

  await repo.updateAttachment({
    id: attachmentId,
    workspaceId,
    createdAt: row.createdAt,
    fields: {
      originPath: newOriginPath,
      mimeType: media.mimeType,
      size: media.size,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    },
  })
}
