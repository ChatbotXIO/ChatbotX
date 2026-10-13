import { extname } from "node:path"

import {
  buildNoAvatarSentinel,
  contactInboxService,
  contactService,
  FAILED_PREFIX,
  isFailedOriginPath,
  isNoAvatarSentinelFresh,
  isPendingOriginPath,
  parseNoAvatarSentinel,
  updateAttachmentOrThrow,
  WA_MEDIA_PREFIX,
} from "@chatbotx.io/business"
import { HTTP_URL_RE } from "@chatbotx.io/business/utils"
import { db } from "@chatbotx.io/database/client"
import {
  type AttachmentLookupRow,
  createMessageRepository,
  type IMessageRepository,
  type MessageWithAttachments,
} from "@chatbotx.io/database/repositories"
import type {
  AttachmentModel,
  ContactInboxModel,
  ContactModel,
} from "@chatbotx.io/database/types"
import {
  getChannelMediaPrefix,
  getMirroredChannelMediaPrefix,
} from "@chatbotx.io/filesystem"
import {
  getWhatsappClient,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { getChildLogger, toLogSafeError } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"
import {
  guessFileTypeFromMimeType,
  IntegrationException,
  SdkException,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  optimizeImageForStorage,
  readImageDimensions,
} from "@chatbotx.io/utils/image-optimize"
import {
  getImageOptimizationSettings,
  isStoredImageOptimizationEnabled,
  runInEncodeSlot,
} from "@chatbotx.io/utils/image-optimize-settings"
import { isUrlOnHosts, META_MEDIA_HOSTS } from "@chatbotx.io/utils/live-media"
import {
  cancelBodyQuietly,
  MediaEmptyBodyError,
  MediaTooLargeError,
  readBodyWithCap as readBodyWithCapPrimitive,
} from "@chatbotx.io/utils/media-download"
import {
  type IntegrationRow,
  integrationService,
  type ResolvedIntegrationContext,
  resolveIntegrationContextFromContactInbox,
} from "./registry"

const log = getChildLogger("media-hydration")
const MEDIA_LOCK_TTL_SECONDS = 5 * 60

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
}

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

export class AttachmentTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AttachmentTooLargeError"
  }
}

export type TerminalMediaReason =
  | "already-failed"
  | "too-large"
  | "unresolvable"

export class TerminalMediaError extends Error {
  readonly reason: TerminalMediaReason

  constructor(reason: TerminalMediaReason, message: string) {
    super(message)
    this.name = "TerminalMediaError"
    this.reason = reason
  }
}

/**
 * A media download answered with a non-success status. The status separates a
 * URL that is gone for good (4xx: expired, forbidden, deleted) from a transient
 * failure (5xx, 408, 429) that a retry may fix.
 */
class MediaFetchError extends SdkException {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "MediaFetchError"
    this.status = status
  }
}

/** The URL answered successfully but served no bytes: nothing left to fetch. */
class MediaEmptyError extends SdkException {
  constructor(message: string) {
    super(message)
    this.name = "MediaEmptyError"
  }
}

const RETRYABLE_CLIENT_ERROR_STATUSES = new Set([408, 429])

// A stored URL that will never serve the media again, as opposed to a failure
// a retry may fix: a 4xx (except 408/429) or an empty body.
const isUrlGone = (err: unknown): boolean =>
  err instanceof MediaEmptyError ||
  (err instanceof MediaFetchError &&
    err.status >= 400 &&
    err.status < 500 &&
    !RETRYABLE_CLIENT_ERROR_STATUSES.has(err.status))

export type DownloadedMedia = {
  bytes: ArrayBuffer
  mimeType: string
  size: number
}

type FreshMedia = {
  // Provider attachment id, present for Graph-resolved media so hydration can
  // match by identity instead of array position. Absent for channels that
  // build the reference inline (e.g. WhatsApp).
  sourceId?: string
  url: string
  mimeType: string | null
}

type ResolvedFreshMedia = FreshMedia & {
  channel: string
  integrationId: string
}

type AttachmentGraph = {
  attachment: AttachmentLookupRow
  contactInbox: ContactInboxModel
  message: MessageWithAttachments
  repository: IMessageRepository
}

type HydrationContext = AttachmentGraph & ResolvedIntegrationContext

type ChannelMediaStrategy = {
  exposesFreshUrl: boolean
  // Hosts a stored provider URL may be downloaded from with the channel's
  // access token (https only, the host or one of its subdomains). A stored URL
  // elsewhere — a shared link, a third-party GIF — never receives the token.
  trustedUrlHosts?: readonly string[]
  resolveMedia?: (state: HydrationContext) => Promise<FreshMedia[]>
  download: (
    media: FreshMedia,
    attachment: AttachmentModel,
    state: HydrationContext,
  ) => Promise<DownloadedMedia>
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
      // MIME inference below handles malformed or extensionless URLs.
    }
  }

  return MIME_EXTENSION_MAP[mimeType] ?? ""
}

const compareAttachmentIds = (
  left: Pick<AttachmentModel, "id">,
  right: Pick<AttachmentModel, "id">,
): number => {
  try {
    const leftId = BigInt(left.id)
    const rightId = BigInt(right.id)
    if (leftId < rightId) {
      return -1
    }
    if (leftId > rightId) {
      return 1
    }
    return 0
  } catch {
    return left.id.localeCompare(right.id)
  }
}

export const readBodyWithCap = async (
  response: Response,
  label: string,
): Promise<ArrayBuffer> => {
  try {
    return await readBodyWithCapPrimitive(response, {
      maxBytes: MAX_ATTACHMENT_BYTES,
      label: `[media-hydration] ${label}`,
    })
  } catch (err) {
    // Map the generic size/empty-body errors onto the attachment pipeline's
    // domain errors so `hydrateAttachment` can still detect "too large" and
    // mark the attachment terminally failed.
    if (err instanceof MediaTooLargeError) {
      throw new AttachmentTooLargeError(err.message)
    }
    if (err instanceof MediaEmptyBodyError) {
      throw new MediaEmptyError(err.message)
    }
    throw err
  }
}

export const downloadBearerUrlMedia = async (props: {
  url: string
  accessToken: string
  fallbackMime: string
  label: string
}): Promise<DownloadedMedia> => {
  const response = await fetch(props.url, {
    headers: {
      Authorization: `Bearer ${props.accessToken}`,
      "User-Agent": "node",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!(response.ok && response.body)) {
    // Release the socket before throwing so retries (BullMQ) don't pile up
    // connections holding unread error-response bodies.
    await cancelBodyQuietly(response.body)
    if (response.ok) {
      throw new MediaEmptyError(
        `[media-hydration] ${props.label} fetch returned no body`,
      )
    }
    throw new MediaFetchError(
      `[media-hydration] ${props.label} fetch failed: ${response.status} ${response.statusText}`,
      response.status,
    )
  }
  const bytes = await readBodyWithCap(response, `${props.label} attachment`)
  if (bytes.byteLength === 0) {
    throw new MediaEmptyError(
      `[media-hydration] ${props.label} fetch returned no bytes`,
    )
  }
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? props.fallbackMime,
    size: bytes.byteLength,
  }
}

export const downloadWhatsappMedia = async (
  mediaId: string,
  auth: WhatsappAuthValue,
  fallbackMime: string,
): Promise<DownloadedMedia> => {
  const client = getWhatsappClient(auth)
  const media = await client.retrieveMedia(mediaId)
  if (!("url" in media && "mime_type" in media)) {
    throw new SdkException(
      `[media-hydration] WhatsApp retrieveMedia returned no url for ${mediaId}`,
    )
  }
  return downloadBearerUrlMedia({
    url: media.url,
    accessToken: auth.tokens.accessToken,
    fallbackMime: media.mime_type ?? fallbackMime,
    label: "WhatsApp",
  })
}

const resolveGraphMedia = async (
  state: HydrationContext,
): Promise<FreshMedia[]> => {
  if (!state.message.sourceId) {
    return []
  }
  return await state.integration.runChannelHandler(
    "message",
    "getMessageMediaUrls",
    {
      ctx: state.ctx,
      data: { graphMessageId: state.message.sourceId },
    },
  )
}

const downloadGraphMedia = (
  media: FreshMedia,
  attachment: AttachmentModel,
  state: HydrationContext,
): Promise<DownloadedMedia> => {
  const auth = state.ctx.auth
  const tokens = "tokens" in auth ? auth.tokens : undefined
  if (
    typeof tokens !== "object" ||
    tokens === null ||
    !("accessToken" in tokens) ||
    typeof tokens.accessToken !== "string"
  ) {
    throw new SdkException(
      `[media-hydration] Missing access token for ${state.contactInbox.channel}`,
    )
  }
  return downloadBearerUrlMedia({
    url: media.url,
    accessToken: tokens.accessToken,
    fallbackMime: media.mimeType ?? attachment.mimeType,
    label: state.contactInbox.channel,
  })
}

const channelMediaStrategies: Partial<Record<string, ChannelMediaStrategy>> = {
  instagram: {
    exposesFreshUrl: true,
    trustedUrlHosts: META_MEDIA_HOSTS,
    resolveMedia: resolveGraphMedia,
    download: downloadGraphMedia,
  },
  messenger: {
    exposesFreshUrl: true,
    trustedUrlHosts: META_MEDIA_HOSTS,
    resolveMedia: resolveGraphMedia,
    download: downloadGraphMedia,
  },
  whatsapp: {
    exposesFreshUrl: false,
    download: (media, attachment, state) => {
      if (!media.url.startsWith(WA_MEDIA_PREFIX)) {
        throw new TerminalMediaError(
          "unresolvable",
          `WhatsApp attachment ${attachment.id} has no media id`,
        )
      }
      return downloadWhatsappMedia(
        media.url.slice(WA_MEDIA_PREFIX.length),
        state.integrationRow.auth as WhatsappAuthValue,
        media.mimeType ?? attachment.mimeType,
      )
    },
  },
}

const loadAttachment = async (input: {
  attachmentId: string
  workspaceId: string
  // Parent message createdAt: routes a sharded lookup straight to the window
  // holding the row instead of only the recent shards.
  messageCreatedAt?: Date
}): Promise<Pick<AttachmentGraph, "attachment" | "repository"> | null> => {
  const repository = await createMessageRepository(db)
  const attachment = await repository.findAttachmentById({
    id: input.attachmentId,
    workspaceId: input.workspaceId,
    ...(input.messageCreatedAt
      ? { messageCreatedAt: input.messageCreatedAt }
      : {}),
  })
  if (!attachment) {
    return null
  }

  return { attachment, repository }
}

const loadAttachmentGraphFromLookup = async (
  lookup: Pick<AttachmentGraph, "attachment" | "repository">,
  workspaceId: string,
): Promise<AttachmentGraph | null> => {
  const { attachment, repository } = lookup

  const message = await repository.findById({
    id: attachment.messageId,
    createdAt: attachment.messageCreatedAt,
    workspaceId,
  })
  if (!message) {
    return null
  }

  const contactInbox = await contactInboxService.findByUncached({
    where: { id: message.contactInboxId },
  })
  if (!contactInbox) {
    return null
  }

  return { attachment, contactInbox, message, repository }
}

const loadAttachmentGraph = async (input: {
  attachmentId: string
  workspaceId: string
  messageCreatedAt?: Date
}): Promise<AttachmentGraph | null> => {
  const lookup = await loadAttachment(input)
  return lookup
    ? await loadAttachmentGraphFromLookup(lookup, input.workspaceId)
    : null
}

const resolveHydrationContext = async (
  graph: AttachmentGraph,
  workspaceId: string,
): Promise<HydrationContext> => {
  const resolved = await resolveIntegrationContextFromContactInbox({
    workspaceId,
    contactInbox: graph.contactInbox,
  })
  return { ...graph, ...resolved }
}

export async function resolveIntegrationForAttachment(input: {
  attachmentId: string
  workspaceId: string
  messageCreatedAt?: Date
}): Promise<{ channel: string; integrationRow: IntegrationRow } | null> {
  const graph = await loadAttachmentGraph(input)
  if (!graph) {
    return null
  }
  const integrationRow =
    await integrationService.getIntegrationFromContactInbox(graph.contactInbox)
  return { channel: graph.contactInbox.channel, integrationRow }
}

const isMirroredOriginPath = (originPath: string): boolean =>
  !(isFailedOriginPath(originPath) || isPendingOriginPath(originPath))

const throwIfTerminal = (originPath: string, attachmentId: string): void => {
  if (isFailedOriginPath(originPath)) {
    throw new TerminalMediaError(
      "already-failed",
      `Attachment ${attachmentId} is permanently unavailable`,
    )
  }
}

// A row ingested lazily at the webhook: no provider attachment id, and the
// reference is the provider URL the webhook delivered (on a host we trust).
const isLiveWebhookRow = (
  attachment: Pick<AttachmentModel, "originPath" | "sourceId">,
  strategy: ChannelMediaStrategy,
): boolean =>
  !attachment.sourceId &&
  isUrlOnHosts(attachment.originPath, strategy.trustedUrlHosts)

type FreshMediaMatch = {
  attachment: AttachmentModel
  media: FreshMedia
  state: HydrationContext
  strategy: ChannelMediaStrategy
}

// Re-derive the requested attachment's fresh media from its channel. Null when
// the channel cannot expose a fresh URL or the provider no longer returns it.
const matchFreshMedia = async (
  lookup: Pick<AttachmentGraph, "attachment" | "repository">,
  input: { attachmentId: string; workspaceId: string; skipStoredUrl?: boolean },
): Promise<FreshMediaMatch | null> => {
  const graph = await loadAttachmentGraphFromLookup(lookup, input.workspaceId)
  if (!graph) {
    return null
  }

  const state = await resolveHydrationContext(graph, input.workspaceId)
  const strategy = channelMediaStrategies[state.contactInbox.channel]
  if (!(strategy?.exposesFreshUrl && strategy.resolveMedia)) {
    return null
  }
  if (!state.message.sourceId) {
    throw new TerminalMediaError(
      "unresolvable",
      `Message source id is missing for attachment ${input.attachmentId}`,
    )
  }

  const attachments = [...state.message.attachments].sort(compareAttachmentIds)
  const requested = attachments.find((item) => item.id === input.attachmentId)
  if (!requested) {
    return null
  }
  if (!input.skipStoredUrl && isLiveWebhookRow(requested, strategy)) {
    // The webhook's own URL: serve it as it is. The provider is only asked
    // when that URL has expired, and that recovery belongs to the mirror.
    return {
      attachment: requested,
      media: { url: requested.originPath, mimeType: requested.mimeType },
      state,
      strategy,
    }
  }
  const media = await strategy.resolveMedia(state)
  const position = attachments.indexOf(requested)
  // Match the requested attachment to its fresh media by provider id, not by
  // array position; fall back to positional only for legacy rows with no id.
  let resolved = requested.sourceId
    ? (media.find((item) => item.sourceId === requested.sourceId) ?? null)
    : (pairByPosition(media, requested, position, attachments.length) ?? null)
  // Realtime-received attachments are stored with a generated sourceId, never
  // the provider's attachment id, so identity can't pair them. For a mirrored
  // row (re-deriving an evicted object) pair by position instead — but only
  // for a single-attachment message: equal counts do not prove equal order,
  // and a restore writes the paired bytes (and their metadata) under this
  // row's key, so pairing the wrong sibling would permanently swap two
  // customer photos. A multi-attachment row without a provider id stays
  // unrestorable rather than possibly wrong.
  if (
    !resolved &&
    isMirroredOriginPath(requested.originPath) &&
    attachments.length === 1 &&
    media.length === 1
  ) {
    resolved = media[position] ?? null
  }
  return resolved
    ? { attachment: requested, media: resolved, state, strategy }
    : null
}

export async function resolveFreshMediaUrl(input: {
  attachmentId: string
  workspaceId: string
  // Also re-derive media for a row that is already mirrored — used when its
  // stored object is gone and the caller wants the channel's copy instead.
  allowMirrored?: boolean
  // The stored webhook URL already failed to load (likely expired): ask the
  // provider for a fresh one instead of handing out the same URL again.
  skipStoredUrl?: boolean
  messageCreatedAt?: Date
}): Promise<ResolvedFreshMedia | null> {
  const lookup = await loadAttachment(input)
  if (!lookup) {
    return null
  }
  throwIfTerminal(lookup.attachment.originPath, input.attachmentId)
  if (
    !(input.allowMirrored || isPendingOriginPath(lookup.attachment.originPath))
  ) {
    return null
  }

  const match = await matchFreshMedia(lookup, input)
  return match
    ? {
        ...match.media,
        channel: match.state.contactInbox.channel,
        integrationId: match.state.integrationRow.id,
      }
    : null
}

const markAttachmentFailed = async (
  repository: IMessageRepository,
  workspaceId: string,
  attachment: AttachmentModel,
  reason: Exclude<TerminalMediaReason, "already-failed">,
): Promise<void> => {
  await updateAttachmentOrThrow(repository, {
    id: attachment.id,
    workspaceId,
    createdAt: attachment.createdAt,
    fields: {
      originPath: `${FAILED_PREFIX}${reason}`,
      mimeType: attachment.mimeType,
      size: attachment.size,
      ...(attachment.width === null ? {} : { width: attachment.width }),
      ...(attachment.height === null ? {} : { height: attachment.height }),
    },
  })
}

export async function markAttachmentUnresolvable(input: {
  attachmentId: string
  workspaceId: string
  // Routes a sharded lookup straight to the window holding the row.
  messageCreatedAt?: Date
}): Promise<void> {
  const graph = await loadAttachmentGraph(input)
  const attachment = graph?.message.attachments.find(
    (item) => item.id === input.attachmentId,
  )
  if (!(graph && attachment && isPendingOriginPath(attachment.originPath))) {
    return
  }

  await markAttachmentFailed(
    graph.repository,
    input.workspaceId,
    attachment,
    "unresolvable",
  )
}

// Download through the channel strategy, surfacing an over-cap body as a
// terminal failure. Whether that failure is persisted is the caller's call.
const downloadMedia = async (
  state: HydrationContext,
  strategy: ChannelMediaStrategy,
  attachment: AttachmentModel,
  mediaReference: FreshMedia,
): Promise<DownloadedMedia> => {
  try {
    return await strategy.download(mediaReference, attachment, state)
  } catch (err) {
    if (err instanceof AttachmentTooLargeError) {
      throw new TerminalMediaError(
        "too-large",
        `Attachment ${attachment.id} exceeds the media size limit`,
      )
    }
    throw err
  }
}

// Keys under the shared `public/` storage prefix are uploaded `public-read` by
// the realtime receive paths; mirrored copies (`workspace/...`) stay private.
const PUBLIC_STORAGE_PREFIX = "public/"

const putMediaObject = async (
  state: HydrationContext,
  key: string,
  media: DownloadedMedia,
  options: { preserveAcl?: boolean } = {},
): Promise<void> => {
  if (!state.ctx.uploader) {
    throw new SdkException("[media-hydration] Object storage is unavailable")
  }
  // A key under `public/` must be written public-read: an overwrite keeps the
  // URLs already handed out for it working, and a live webhook row's first
  // copy stays reachable the way an eagerly downloaded one always was.
  const isPublicKey =
    options.preserveAcl && key.startsWith(PUBLIC_STORAGE_PREFIX)
  await state.ctx.uploader.putObject(key, Buffer.from(media.bytes), {
    ...(isPublicKey ? { ACL: "public-read" } : {}),
    ContentLength: media.size,
    ContentType: media.mimeType,
  })
}

type MirroredImage = {
  media: DownloadedMedia
  optimized: boolean
  width?: number
  height?: number
}

// Only photos go through the optimizer; video, documents and images the
// sender attached as a file (`keepOriginal`) are stored as-is.
const encodeMirroredImage = async (
  media: DownloadedMedia,
  keepOriginal: boolean | null,
): Promise<MirroredImage> => {
  if (
    keepOriginal === true ||
    !media.mimeType.startsWith("image/") ||
    !isStoredImageOptimizationEnabled()
  ) {
    return { media, optimized: false }
  }
  const { inline, job } = getImageOptimizationSettings()
  // Background work like the job: same source ceiling, and it waits its turn
  // for one of the process's encode slots instead of decoding many photos at
  // once (each decode takes tens of MB).
  if (media.size > job.maxSourceBytes) {
    return { media, optimized: false }
  }
  const slot = await runInEncodeSlot(
    { limit: Math.max(1, inline.maxConcurrentEncodes), wait: true },
    () =>
      optimizeImageForStorage({
        bytes: media.bytes,
        mimeType: media.mimeType,
        profile: "media",
      }),
  )
  const result = slot?.value
  if (!result?.optimized) {
    return { media, optimized: false }
  }
  return {
    media: {
      // Copy out of sharp's Buffer, which may sit in Node's shared pool.
      bytes: new Uint8Array(result.bytes).buffer,
      mimeType: result.mimeType,
      size: result.bytes.length,
    },
    optimized: true,
    width: result.width,
    height: result.height,
  }
}

// The key already exists: a re-encode may only replace the bytes when the
// key's extension still describes them (an extension-less webhook key always
// does). A `.png` key must never end up holding JPEG bytes.
const encodeForExistingKey = async (
  key: string,
  media: DownloadedMedia,
  keepOriginal: boolean | null,
): Promise<MirroredImage> => {
  const stored = await encodeMirroredImage(media, keepOriginal)
  if (!stored.optimized) {
    return stored
  }
  const fileName = key.slice(key.lastIndexOf("/") + 1)
  const dot = fileName.lastIndexOf(".")
  const extension = dot === -1 ? "" : fileName.slice(dot + 1)
  if (extension && MIME_EXTENSION_MAP[stored.media.mimeType] !== extension) {
    return { media, optimized: false }
  }
  return stored
}

/**
 * The row's width/height for what was actually written: the encoder reports
 * them for a re-encode, otherwise they are read from the stored image bytes so
 * a row never keeps the dimensions of an earlier, different copy.
 */
const storedImageDimensions = async (
  stored: MirroredImage,
): Promise<{ width?: number; height?: number }> => {
  if (stored.optimized || !stored.media.mimeType.startsWith("image/")) {
    return { width: stored.width, height: stored.height }
  }
  const dimensions = await readImageDimensions(Buffer.from(stored.media.bytes))
  return { width: dimensions?.width, height: dimensions?.height }
}

type MirrorSource = "stored-url" | "graph" | "channel"

/** Where an attachment's bytes are now, and what they are. */
type StoredAttachment = { originPath: string; mimeType: string; size: number }

/** A stored key the caller already held carries no metadata of its own. */
export type EnsuredAttachment = Pick<StoredAttachment, "originPath"> &
  Partial<Omit<StoredAttachment, "originPath">>

const toStoredAttachment = (
  attachment: Pick<AttachmentModel, "originPath" | "mimeType" | "size">,
): StoredAttachment => ({
  originPath: attachment.originPath,
  mimeType: attachment.mimeType,
  size: attachment.size,
})

const mirrorAttachment = async (
  state: HydrationContext,
  strategy: ChannelMediaStrategy,
  attachment: AttachmentModel,
  mediaReference: FreshMedia,
  source: MirrorSource,
): Promise<StoredAttachment> => {
  const startedAt = Date.now()
  let downloaded: DownloadedMedia
  try {
    downloaded = await downloadMedia(
      state,
      strategy,
      attachment,
      mediaReference,
    )
  } catch (err) {
    if (err instanceof TerminalMediaError && err.reason === "too-large") {
      await markAttachmentFailed(
        state.repository,
        state.message.workspaceId,
        attachment,
        "too-large",
      )
    }
    throw err
  }

  // The bytes are in hand and about to be written, so a photo is re-encoded
  // here rather than stored and re-read by the background optimization job.
  // The optimizer returns the source untouched for anything it cannot shrink.
  const stored = await encodeMirroredImage(downloaded, attachment.keepOriginal)
  // A re-encode may change the format (PNG → JPEG), so the key's extension
  // follows the stored bytes, never the source URL.
  const extension = stored.optimized
    ? (MIME_EXTENSION_MAP[stored.media.mimeType] ?? "")
    : getStorageExtension(mediaReference.url, stored.media.mimeType)
  // A live webhook row stores where an eagerly downloaded copy always went:
  // publicly readable, because flows pass its URL on ({{last_input}}, custom
  // fields). History-import copies stay private.
  const isLiveRow = isLiveWebhookRow(attachment, strategy)
  const location = {
    channel: state.contactInbox.channel,
    workspaceId: state.message.workspaceId,
    integrationId: state.integrationRow.id,
  }
  const prefix = isLiveRow
    ? getChannelMediaPrefix(location)
    : getMirroredChannelMediaPrefix(location)
  const originPath = `${prefix}/${createId()}${extension ? `.${extension}` : ""}`
  await putMediaObject(state, originPath, stored.media, {
    preserveAcl: isLiveRow,
  })

  const { width, height } = await storedImageDimensions(stored)

  await updateAttachmentOrThrow(state.repository, {
    id: attachment.id,
    workspaceId: state.message.workspaceId,
    createdAt: attachment.createdAt,
    fields: {
      originPath,
      mimeType: stored.media.mimeType,
      size: stored.media.size,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    },
  })
  log.info(
    {
      attachmentId: attachment.id,
      channel: state.contactInbox.channel,
      source,
      optimized: stored.optimized,
      bytesBefore: downloaded.size,
      bytesAfter: stored.media.size,
      durationMs: Date.now() - startedAt,
    },
    "media-hydration: attachment mirrored",
  )
  return {
    originPath,
    mimeType: stored.media.mimeType,
    size: stored.media.size,
  }
}

type MirrorPendingAttachmentInput = {
  state: HydrationContext
  strategy: ChannelMediaStrategy
  attachment: AttachmentModel
  // Position among the message's attachments, sorted by id.
  index: number
  attachmentCount: number
  isRequested: boolean
  getFreshMedia: () => Promise<FreshMedia[]>
}

// A fresh Graph entry may only stand in for a row that has no provider id when
// the message still lists exactly the stored attachments AND the entry at this
// position is the same kind of file. Equal counts do not prove equal order, so
// the kind check is what keeps a photo and a video from being swapped; it is the
// accepted residual risk that two same-kind attachments of one message could be.
const pairByPosition = (
  media: readonly FreshMedia[],
  attachment: AttachmentModel,
  index: number,
  attachmentCount: number,
): FreshMedia | undefined => {
  const candidate = media[index]
  if (media.length !== attachmentCount || !candidate) {
    return
  }
  return guessFileTypeFromMimeType(candidate.mimeType ?? "") ===
    attachment.fileType
    ? candidate
    : undefined
}

const resolveFreshReference = async (
  input: MirrorPendingAttachmentInput,
): Promise<FreshMedia | undefined> => {
  const { attachment, index, attachmentCount, getFreshMedia } = input
  const media = await getFreshMedia()
  return attachment.sourceId
    ? media.find((item) => item.sourceId === attachment.sourceId)
    : pairByPosition(media, attachment, index, attachmentCount)
}

// Returns the mirrored key, or null when a sibling (not the requested row) has
// no media to mirror — one gap must not sink the whole request.
const mirrorPendingAttachment = async (
  input: MirrorPendingAttachmentInput,
): Promise<StoredAttachment | null> => {
  const { state, strategy, attachment, isRequested } = input

  if (!strategy.exposesFreshUrl) {
    return await mirrorAttachment(
      state,
      strategy,
      attachment,
      { url: attachment.originPath, mimeType: attachment.mimeType },
      "channel",
    )
  }

  // A live webhook row (no provider id) holds the URL the webhook delivered:
  // download it directly. Only if that URL is gone (4xx) is the provider asked.
  if (isLiveWebhookRow(attachment, strategy)) {
    try {
      return await mirrorAttachment(
        state,
        strategy,
        attachment,
        { url: attachment.originPath, mimeType: attachment.mimeType },
        "stored-url",
      )
    } catch (err) {
      if (!isUrlGone(err)) {
        throw err
      }
    }
  }

  const reference = await resolveFreshReference(input)
  if (reference) {
    return await mirrorAttachment(
      state,
      strategy,
      attachment,
      reference,
      "graph",
    )
  }
  if (!isRequested) {
    return null
  }
  // The provider answered but cannot be paired with / no longer exposes media
  // for this attachment (expired story, unsent message, url-less share, a
  // changed attachment list) — retrying gets the same answer. Transport
  // failures throw from `getFreshMedia` and stay retryable.
  await markAttachmentFailed(
    state.repository,
    state.message.workspaceId,
    attachment,
    "unresolvable",
  )
  throw new TerminalMediaError(
    "unresolvable",
    `Media reference is unavailable for attachment ${attachment.id}`,
  )
}

export async function ensureAttachmentMirrored(input: {
  attachmentId: string
  workspaceId: string
  // Routes a sharded lookup straight to the window holding the row.
  messageCreatedAt?: Date
  // How long to wait for another worker already mirroring this message.
  // Defaults to the lock TTL, which suits a background job but not a caller
  // that is itself waiting on the result.
  lockWaitSeconds?: number
  // Also store the message's other pending attachments under the same lock
  // and provider call (the background job). A caller waiting on the result
  // turns this off so it never waits on attachments it did not ask for.
  includeSiblings?: boolean
}): Promise<StoredAttachment> {
  const includeSiblings = input.includeSiblings ?? true
  const initial = await loadAttachment(input)
  if (!initial) {
    throw new TerminalMediaError(
      "unresolvable",
      `Attachment ${input.attachmentId} was not found`,
    )
  }
  throwIfTerminal(initial.attachment.originPath, input.attachmentId)
  if (!isPendingOriginPath(initial.attachment.originPath)) {
    return toStoredAttachment(initial.attachment)
  }

  return await distributedLock.runExclusive({
    key: `media-hydration:${input.workspaceId}:${initial.attachment.messageId}`,
    timeoutInSeconds: MEDIA_LOCK_TTL_SECONDS,
    ...(input.lockWaitSeconds === undefined
      ? {}
      : { retryTimeoutInSeconds: input.lockWaitSeconds }),
    fn: async () => {
      const graph = await loadAttachmentGraph(input)
      if (!graph) {
        throw new TerminalMediaError(
          "unresolvable",
          `Attachment ${input.attachmentId} was not found`,
        )
      }
      throwIfTerminal(graph.attachment.originPath, input.attachmentId)
      if (!isPendingOriginPath(graph.attachment.originPath)) {
        return toStoredAttachment(graph.attachment)
      }
      // A channel without media hydration stores the provider's own durable
      // URL (TikTok, the API channel): that URL is the media, not a reference.
      if (!channelMediaStrategies[graph.contactInbox.channel]) {
        if (HTTP_URL_RE.test(graph.attachment.originPath)) {
          return toStoredAttachment(graph.attachment)
        }
        throw new TerminalMediaError(
          "unresolvable",
          `No media hydration strategy for attachment ${input.attachmentId}`,
        )
      }

      const state = await resolveHydrationContext(graph, input.workspaceId)
      const strategy = channelMediaStrategies[state.contactInbox.channel]
      if (!strategy) {
        throw new TerminalMediaError(
          "unresolvable",
          `No media hydration strategy for attachment ${input.attachmentId}`,
        )
      }

      const attachments = [...state.message.attachments].sort(
        compareAttachmentIds,
      )
      if (strategy.exposesFreshUrl && !state.message.sourceId) {
        const requested = attachments.find(
          (item) => item.id === input.attachmentId,
        )
        if (requested) {
          await markAttachmentFailed(
            state.repository,
            input.workspaceId,
            requested,
            "unresolvable",
          )
        }
        throw new TerminalMediaError(
          "unresolvable",
          `Message source id is missing for attachment ${input.attachmentId}`,
        )
      }

      // Fresh media from the provider is only fetched when a row needs it: a
      // live webhook row is first tried against its stored URL, so a message
      // whose stored URLs all still work never costs a provider call.
      let freshMedia: Promise<FreshMedia[]> | undefined
      const getFreshMedia = (): Promise<FreshMedia[]> => {
        if (!strategy.resolveMedia) {
          throw new SdkException(
            `[media-hydration] Fresh media resolver is unavailable for ${state.contactInbox.channel}`,
          )
        }
        freshMedia ??= strategy.resolveMedia(state)
        return freshMedia
      }

      // The requested attachment goes first and decides the outcome. Its
      // siblings ride along on the same lock and provider call, best effort:
      // a sibling's failure leaves it pending for its own retry and must
      // never block, or mark as failed, the attachment that was asked for.
      const ordered = [...attachments.entries()].sort(
        ([, a], [, b]) =>
          Number(b.id === input.attachmentId) -
          Number(a.id === input.attachmentId),
      )
      let requested: StoredAttachment | undefined
      for (const [index, attachment] of ordered) {
        const isRequested = attachment.id === input.attachmentId
        if (!(isRequested || includeSiblings)) {
          break
        }
        if (!isPendingOriginPath(attachment.originPath)) {
          if (isRequested) {
            requested = toStoredAttachment(attachment)
          }
          continue
        }
        let stored: StoredAttachment | null
        try {
          stored = await mirrorPendingAttachment({
            state,
            strategy,
            attachment,
            index,
            attachmentCount: attachments.length,
            isRequested,
            getFreshMedia,
          })
        } catch (err) {
          if (isRequested) {
            throw err
          }
          if (!(err instanceof TerminalMediaError)) {
            log.warn(
              { err: toLogSafeError(err), attachmentId: attachment.id },
              "media-hydration: sibling attachment not mirrored; left pending",
            )
          }
          continue
        }
        if (isRequested && stored !== null) {
          requested = stored
        }
      }

      if (!requested) {
        throw new SdkException(
          `[media-hydration] Requested attachment ${input.attachmentId} was not present in message ${state.message.id}`,
        )
      }
      return requested
    },
  })
}

/** The attachment is not stored yet and could not be within the caller's wait. */
export class MediaNotReadyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "MediaNotReadyError"
  }
}

const ENSURE_STORED_TIMEOUT_MS = 20_000

// `mimeType`/`size` are present when the row was re-read after a mirror; a caller
// that already held the stored key keeps the metadata it already has.
const rejectAfter = (timeoutMs: number, attachmentId: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const rejection = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new MediaNotReadyError(
            `Attachment ${attachmentId} was not stored within ${timeoutMs}ms`,
          ),
        ),
      timeoutMs,
    )
  })
  // The timer can fire while the caller is still awaiting something else, before
  // the race that consumes `rejection` exists: it must never be unhandled.
  rejection.catch(() => undefined)
  return { rejection, cancel: () => clearTimeout(timer) }
}

/**
 * The single boundary for code that needs an attachment's BYTES (AI readers,
 * text extraction, custom-field saves, outbound re-sends): a pending row is
 * mirrored into storage now, and the caller continues with the stored key.
 *
 * - `null`: the media is permanently unavailable (failed row, provider no
 *   longer exposes it) — treat the attachment as absent.
 * - `MediaNotReadyError`: transient — the mirror is slower than the caller can
 *   wait. The in-flight mirror keeps running and completes the row, so a retry
 *   or the next call finds it stored.
 *
 * Pass `originPath` when the caller already holds it: a stored key returns
 * without a DB read.
 */
export async function ensureAttachmentStored(input: {
  attachmentId: string
  workspaceId: string
  messageCreatedAt?: Date
  // The caller's current value: a stored key returns without a DB read.
  originPath: string
  timeoutMs?: number
}): Promise<EnsuredAttachment | null> {
  const { originPath } = input
  if (isFailedOriginPath(originPath)) {
    return null
  }
  if (!isPendingOriginPath(originPath)) {
    return { originPath }
  }

  const timeoutMs = input.timeoutMs ?? ENSURE_STORED_TIMEOUT_MS
  // One deadline over the whole operation: the lookups, the lock wait and
  // the mirror. The mirror reports what it stored, so nothing is read after.
  const timeout = rejectAfter(timeoutMs, input.attachmentId)
  try {
    return await Promise.race([
      ensureAttachmentMirrored({
        attachmentId: input.attachmentId,
        workspaceId: input.workspaceId,
        ...(input.messageCreatedAt === undefined
          ? {}
          : { messageCreatedAt: input.messageCreatedAt }),
        lockWaitSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
        includeSiblings: false,
      }),
      timeout.rejection,
    ])
  } catch (err) {
    if (err instanceof TerminalMediaError) {
      return null
    }
    if (err instanceof MediaNotReadyError) {
      throw err
    }
    log.warn(
      { err: toLogSafeError(err), attachmentId: input.attachmentId },
      "ensureAttachmentStored: mirror did not complete",
    )
    throw new MediaNotReadyError(
      `Attachment ${input.attachmentId} could not be stored`,
      { cause: err },
    )
  } finally {
    timeout.cancel()
  }
}

/**
 * Re-upload a mirrored attachment's bytes into the storage key its row already
 * points at, for when that object was evicted from storage. The key never
 * changes, so the existing `originPath` becomes valid again; the bytes go
 * through the same encoder as a fresh mirror, and the row's MIME, size and
 * dimensions are rewritten to describe what was actually stored — otherwise a
 * restore would silently undo an earlier compression while the row kept the
 * compressed metadata. Channels that cannot re-derive their media (WhatsApp)
 * are left untouched.
 */
export async function restoreMirroredAttachment(input: {
  attachmentId: string
  workspaceId: string
  messageCreatedAt?: Date
}): Promise<{ restored: boolean }> {
  const lookup = await loadAttachment(input)
  if (!(lookup && isMirroredOriginPath(lookup.attachment.originPath))) {
    return { restored: false }
  }

  return await distributedLock.runExclusive({
    key: `media-hydration:${input.workspaceId}:${lookup.attachment.messageId}`,
    timeoutInSeconds: MEDIA_LOCK_TTL_SECONDS,
    fn: async () => {
      const match = await matchFreshMedia(lookup, input)
      if (!(match && isMirroredOriginPath(match.attachment.originPath))) {
        return { restored: false }
      }
      const { attachment, state, strategy } = match
      const downloaded = await downloadMedia(
        state,
        strategy,
        attachment,
        match.media,
      )
      const stored = await encodeForExistingKey(
        attachment.originPath,
        downloaded,
        attachment.keepOriginal,
      )
      await putMediaObject(state, attachment.originPath, stored.media, {
        preserveAcl: true,
      })
      const { width, height } = await storedImageDimensions(stored)
      await updateAttachmentOrThrow(state.repository, {
        id: attachment.id,
        workspaceId: state.message.workspaceId,
        createdAt: attachment.createdAt,
        fields: {
          originPath: attachment.originPath,
          mimeType: stored.media.mimeType,
          size: stored.media.size,
          ...(width === undefined ? {} : { width }),
          ...(height === undefined ? {} : { height }),
        },
      })
      return { restored: true }
    },
  })
}

type EnsureContactAvatarMirroredInput = {
  contactInboxId: string
  workspaceId: string
}

const storeNoAvatarSentinel = async (
  input: EnsureContactAvatarMirroredInput,
  contactId: string,
  err: unknown,
): Promise<{ avatar: string }> => {
  log.warn(
    {
      // An auth-refresh failure carries the refresh request URL (with its token)
      // on nested error fields; toLogSafeError strips them before logging.
      err: toLogSafeError(err),
      contactInboxId: input.contactInboxId,
      workspaceId: input.workspaceId,
    },
    "Contact avatar mirror failed; storing no-avatar sentinel",
  )
  const sentinel = buildNoAvatarSentinel()
  try {
    await contactService.setAvatarIfEmptyOrSentinel({
      workspaceId: input.workspaceId,
      contactId,
      avatar: sentinel,
    })
  } catch (persistErr) {
    log.warn(
      {
        err: persistErr,
        contactInboxId: input.contactInboxId,
        workspaceId: input.workspaceId,
      },
      "Failed to persist no-avatar sentinel",
    )
  }
  return { avatar: sentinel }
}

const mirrorContactAvatar = async (
  input: EnsureContactAvatarMirroredInput,
  contactInbox: ContactInboxModel,
  contact: ContactModel,
): Promise<{ avatar: string }> => {
  if (contact.avatar) {
    const sentinel = parseNoAvatarSentinel(contact.avatar)
    if (!sentinel || isNoAvatarSentinelFresh(sentinel.failedAtMs)) {
      return { avatar: contact.avatar }
    }
  }

  let avatar: string
  try {
    const { ctx, integration } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: input.workspaceId,
        contactInbox,
      })
    const profile = await integration.runChannelHandler(
      "contact",
      "getProfile",
      {
        ctx,
        data: { sourceId: contactInbox.sourceId },
      },
    )
    avatar = profile?.avatar || buildNoAvatarSentinel()
  } catch (err) {
    return await storeNoAvatarSentinel(input, contact.id, err)
  }

  try {
    await contactService.setAvatarIfEmptyOrSentinel({
      workspaceId: input.workspaceId,
      contactId: contact.id,
      avatar,
    })
  } catch (err) {
    log.warn(
      {
        err,
        contactInboxId: input.contactInboxId,
        workspaceId: input.workspaceId,
      },
      "Failed to persist mirrored avatar",
    )
  }
  return { avatar }
}

export async function ensureContactAvatarMirrored(
  input: EnsureContactAvatarMirroredInput,
): Promise<{ avatar: string } | null> {
  try {
    const contactInbox = await contactInboxService.findByUncached({
      where: { id: input.contactInboxId },
    })
    if (!contactInbox) {
      return null
    }
    const contact = await contactService.findById({
      workspaceId: input.workspaceId,
      id: contactInbox.contactId,
    })
    if (!contact) {
      return null
    }
    return await mirrorContactAvatar(input, contactInbox, contact)
  } catch (err) {
    log.warn(
      {
        err,
        contactInboxId: input.contactInboxId,
        workspaceId: input.workspaceId,
      },
      "Contact avatar mirror failed before persistence; returning no-avatar sentinel",
    )
    return { avatar: buildNoAvatarSentinel() }
  }
}

export async function resolveFreshContactAvatarUrl(input: {
  contactInboxId: string
  workspaceId: string
}): Promise<string | null> {
  const contactInbox = await contactInboxService.findByUncached({
    where: { id: input.contactInboxId },
  })
  if (!contactInbox) {
    return null
  }

  const { ctx, integration } = await resolveIntegrationContextFromContactInbox({
    workspaceId: input.workspaceId,
    contactInbox,
  })

  try {
    return await integration.runChannelHandler(
      "contact",
      "getContactProfilePicUrl",
      {
        ctx,
        data: { sourceId: contactInbox.sourceId },
      },
    )
  } catch (err) {
    if (err instanceof IntegrationException) {
      log.warn(
        { err, contactInboxId: input.contactInboxId },
        "Failed to resolve fresh contact avatar URL",
      )
      return null
    }
    throw err
  }
}
