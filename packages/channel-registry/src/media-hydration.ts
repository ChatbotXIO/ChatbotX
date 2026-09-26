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
  WA_MEDIA_PREFIX,
} from "@chatbotx.io/business"
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
  getWhatsappClient,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"
import { IntegrationException, SdkException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  cancelBodyQuietly,
  MediaEmptyBodyError,
  MediaTooLargeError,
  readBodyWithCap as readBodyWithCapPrimitive,
} from "@chatbotx.io/utils/media-download"
import imageSize from "image-size"
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
      throw new SdkException(err.message)
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
    throw new SdkException(
      `[media-hydration] ${props.label} fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = await readBodyWithCap(response, `${props.label} attachment`)
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
  if (!("tokens" in auth && "accessToken" in auth.tokens)) {
    throw new SdkException(
      `[media-hydration] Missing access token for ${state.contactInbox.channel}`,
    )
  }
  return downloadBearerUrlMedia({
    url: media.url,
    accessToken: auth.tokens.accessToken,
    fallbackMime: media.mimeType ?? attachment.mimeType,
    label: state.contactInbox.channel,
  })
}

const channelMediaStrategies: Partial<Record<string, ChannelMediaStrategy>> = {
  instagram: {
    exposesFreshUrl: true,
    resolveMedia: resolveGraphMedia,
    download: downloadGraphMedia,
  },
  messenger: {
    exposesFreshUrl: true,
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
}): Promise<Pick<AttachmentGraph, "attachment" | "repository"> | null> => {
  const repository = await createMessageRepository(db)
  const attachment = await repository.findAttachmentById({
    id: input.attachmentId,
    workspaceId: input.workspaceId,
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
}): Promise<{ channel: string; integrationRow: IntegrationRow } | null> {
  const graph = await loadAttachmentGraph(input)
  if (!graph) {
    return null
  }
  const integrationRow =
    await integrationService.getIntegrationFromContactInbox(graph.contactInbox)
  return { channel: graph.contactInbox.channel, integrationRow }
}

const throwIfTerminal = (originPath: string, attachmentId: string): void => {
  if (isFailedOriginPath(originPath)) {
    throw new TerminalMediaError(
      "already-failed",
      `Attachment ${attachmentId} is permanently unavailable`,
    )
  }
}

export async function resolveFreshMediaUrl(input: {
  attachmentId: string
  workspaceId: string
}): Promise<ResolvedFreshMedia | null> {
  const lookup = await loadAttachment(input)
  if (!lookup) {
    return null
  }
  throwIfTerminal(lookup.attachment.originPath, input.attachmentId)
  if (!isPendingOriginPath(lookup.attachment.originPath)) {
    return null
  }

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
  const media = await strategy.resolveMedia(state)
  // Match the requested attachment to its fresh media by provider id, not by
  // array position; fall back to positional only for legacy rows with no id.
  const resolved = requested.sourceId
    ? (media.find((item) => item.sourceId === requested.sourceId) ?? null)
    : (media[attachments.indexOf(requested)] ?? null)
  return resolved
    ? {
        ...resolved,
        channel: state.contactInbox.channel,
        integrationId: state.integrationRow.id,
      }
    : null
}

const markAttachmentFailed = async (
  repository: IMessageRepository,
  workspaceId: string,
  attachment: AttachmentModel,
  reason: Exclude<TerminalMediaReason, "already-failed">,
): Promise<void> => {
  await repository.updateAttachment({
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

const mirrorAttachment = async (
  state: HydrationContext,
  strategy: ChannelMediaStrategy,
  attachment: AttachmentModel,
  mediaReference: FreshMedia,
): Promise<string> => {
  let media: DownloadedMedia
  try {
    media = await strategy.download(mediaReference, attachment, state)
  } catch (err) {
    if (err instanceof AttachmentTooLargeError) {
      await markAttachmentFailed(
        state.repository,
        state.message.workspaceId,
        attachment,
        "too-large",
      )
      throw new TerminalMediaError(
        "too-large",
        `Attachment ${attachment.id} exceeds the media size limit`,
      )
    }
    throw err
  }

  const extension = getStorageExtension(mediaReference.url, media.mimeType)
  const originPath = `workspace/${state.ctx.storagePrefix}/${createId()}${extension ? `.${extension}` : ""}`
  if (!state.ctx.uploader) {
    throw new SdkException("[media-hydration] Object storage is unavailable")
  }
  await state.ctx.uploader.putObject(originPath, Buffer.from(media.bytes), {
    ContentLength: media.size,
    ContentType: media.mimeType,
  })

  let width: number | undefined
  let height: number | undefined
  if (media.mimeType.startsWith("image/")) {
    try {
      const dimensions = imageSize(new Uint8Array(media.bytes))
      width = dimensions.width
      height = dimensions.height
    } catch (err) {
      log.warn(
        { err, attachmentId: attachment.id },
        "Unable to read mirrored attachment dimensions",
      )
    }
  }

  await state.repository.updateAttachment({
    id: attachment.id,
    workspaceId: state.message.workspaceId,
    createdAt: attachment.createdAt,
    fields: {
      originPath,
      mimeType: media.mimeType,
      size: media.size,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    },
  })
  return originPath
}

export async function ensureAttachmentMirrored(input: {
  attachmentId: string
  workspaceId: string
}): Promise<{ originPath: string }> {
  const initial = await loadAttachment(input)
  if (!initial) {
    throw new TerminalMediaError(
      "unresolvable",
      `Attachment ${input.attachmentId} was not found`,
    )
  }
  throwIfTerminal(initial.attachment.originPath, input.attachmentId)
  if (!isPendingOriginPath(initial.attachment.originPath)) {
    return { originPath: initial.attachment.originPath }
  }

  return await distributedLock.runExclusive({
    key: `media-hydration:${input.workspaceId}:${initial.attachment.messageId}`,
    timeoutInSeconds: MEDIA_LOCK_TTL_SECONDS,
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
        return { originPath: graph.attachment.originPath }
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

      let media: FreshMedia[] | undefined
      if (strategy.exposesFreshUrl) {
        if (!strategy.resolveMedia) {
          throw new SdkException(
            `[media-hydration] Fresh media resolver is unavailable for ${state.contactInbox.channel}`,
          )
        }
        media = await strategy.resolveMedia(state)
      }
      // Match fresh media to stored attachments by provider id, not by array
      // position: the re-derive can return a different order or subset than the
      // stored rows (e.g. a mixed message with an undownloadable attachment).
      const mediaBySourceId = new Map<string, FreshMedia>()
      for (const item of media ?? []) {
        if (item.sourceId) {
          mediaBySourceId.set(item.sourceId, item)
        }
      }

      let requestedOriginPath: string | undefined
      for (const [index, attachment] of attachments.entries()) {
        if (!isPendingOriginPath(attachment.originPath)) {
          if (attachment.id === input.attachmentId) {
            requestedOriginPath = attachment.originPath
          }
          continue
        }
        let mediaReference: FreshMedia | undefined
        if (strategy.exposesFreshUrl) {
          mediaReference = attachment.sourceId
            ? mediaBySourceId.get(attachment.sourceId)
            : media?.[index]
        } else {
          mediaReference = {
            url: attachment.originPath,
            mimeType: attachment.mimeType,
          }
        }
        if (!mediaReference) {
          // Fresh media for this pending attachment is unavailable. Fail only
          // the requested attachment (retryable, same as before); skip
          // unrelated siblings so one gap can't sink the whole request.
          if (attachment.id === input.attachmentId) {
            throw new SdkException(
              `[media-hydration] Media reference is unavailable for attachment ${attachment.id}`,
            )
          }
          continue
        }
        let originPath: string
        try {
          originPath = await mirrorAttachment(
            state,
            strategy,
            attachment,
            mediaReference,
          )
        } catch (err) {
          if (
            err instanceof TerminalMediaError &&
            attachment.id !== input.attachmentId
          ) {
            continue
          }
          throw err
        }
        if (attachment.id === input.attachmentId) {
          requestedOriginPath = originPath
        }
      }

      if (!requestedOriginPath) {
        throw new SdkException(
          `[media-hydration] Requested attachment ${input.attachmentId} was not present in message ${state.message.id}`,
        )
      }
      return { originPath: requestedOriginPath }
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
      err,
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
