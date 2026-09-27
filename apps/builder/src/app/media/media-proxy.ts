export {
  isFailedOriginPath,
  isPendingOriginPath,
} from "@chatbotx.io/business"

import {
  resolveIntegrationForAttachment,
  TerminalMediaError,
} from "@chatbotx.io/channel-registry/media-hydration"
import type { MediaTokenPayload } from "@chatbotx.io/encryption"
import { verifyMediaToken } from "@chatbotx.io/encryption"
import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import {
  LowJobAction,
  type LowJobCoexistAttachmentDownload,
  lowQueue,
} from "@chatbotx.io/worker-config"
import { type NextRequest, NextResponse } from "next/server"
import { httpLogger } from "@/lib/log"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

const MEDIA_RATE_LIMIT_SCOPE = "media-proxy"
const MEDIA_IP_LIMIT = 600
const MEDIA_TOKEN_LIMIT = 20

type MediaKind = MediaTokenPayload["kind"]
type AttachmentChannel = LowJobCoexistAttachmentDownload["data"]["channel"]

const ATTACHMENT_CHANNELS = new Set<AttachmentChannel>([
  "instagram",
  "messenger",
  "whatsapp",
])

const isAttachmentChannel = (channel: string): channel is AttachmentChannel =>
  ATTACHMENT_CHANNELS.has(channel as AttachmentChannel)

export const placeholderUrl = (
  request: NextRequest,
  filename: "default-avatar.svg" | "processing.svg" | "unavailable.svg",
): URL => new URL(`/media/${filename}`, getPublicOriginFromRequest(request))

export const resolveMediaRequest = async (input: {
  kind: MediaKind
  request: NextRequest
  token: string
}): Promise<MediaTokenPayload | NextResponse> => {
  let payload: MediaTokenPayload | null
  try {
    payload = await verifyMediaToken(input.token)
  } catch {
    payload = null
  }
  if (!payload || payload.kind !== input.kind) {
    return new NextResponse(null, { status: 404 })
  }

  const rateLimit = await checkGuestRateLimit({
    webchatId: MEDIA_RATE_LIMIT_SCOPE,
    clientIp: resolveGuestRateLimitKey(
      input.request.headers,
      payload.workspaceId,
    ),
    guestConversationId: input.token,
    ipLimit: MEDIA_IP_LIMIT,
    sessionLimit: MEDIA_TOKEN_LIMIT,
  })
  if (rateLimit.limited) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfter) },
    })
  }

  const { servable } = await loadServableWorkspace(payload.workspaceId)
  if (!servable) {
    return new NextResponse(null, { status: 410 })
  }

  return payload
}

export const enqueueAttachmentMirror = (input: {
  attachmentId: string
  channel?: string
  integrationId?: string
  messageId: string
  workspaceId: string
}): void => {
  if (input.channel && input.integrationId) {
    if (!isAttachmentChannel(input.channel)) {
      return
    }
    enqueueResolvedAttachmentMirror({
      ...input,
      channel: input.channel,
      integrationId: input.integrationId,
    })
    return
  }

  resolveIntegrationForAttachment({
    attachmentId: input.attachmentId,
    workspaceId: input.workspaceId,
  })
    .then(async (resolved) => {
      if (!(resolved && isAttachmentChannel(resolved.channel))) {
        return
      }
      await enqueueResolvedAttachmentMirror({
        ...input,
        channel: resolved.channel,
        integrationId: resolved.integrationRow.id,
      })
    })
    .catch((err: unknown) => {
      httpLogger.error(
        { err, attachmentId: input.attachmentId },
        "Failed to enqueue attachment media mirror",
      )
    })
}

function enqueueResolvedAttachmentMirror(input: {
  attachmentId: string
  channel: AttachmentChannel
  integrationId: string
  messageId: string
  workspaceId: string
}): void {
  lowQueue
    .add(
      LowJobAction.coexistAttachmentDownload,
      {
        type: LowJobAction.coexistAttachmentDownload,
        data: {
          attachmentId: input.attachmentId,
          workspaceId: input.workspaceId,
          channel: input.channel,
          integrationId: input.integrationId,
        },
      },
      {
        jobId: `media-message-${input.messageId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    )
    .catch((err: unknown) => {
      httpLogger.error(
        { err, attachmentId: input.attachmentId },
        "Failed to enqueue attachment media mirror",
      )
    })
}

export const enqueueAvatarMirror = (input: {
  contactInboxId: string
  sourceId: string
  workspaceId: string
}): void => {
  lowQueue
    .add(
      LowJobAction.updateContactAvatar,
      {
        type: LowJobAction.updateContactAvatar,
        data: input,
      },
      {
        jobId: `update-avatar-${input.contactInboxId}`,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    )
    .catch((err: unknown) => {
      httpLogger.error(
        { err, contactInboxId: input.contactInboxId },
        "Failed to enqueue contact avatar mirror",
      )
    })
}

export const isTerminalMediaError = (err: unknown): err is TerminalMediaError =>
  err instanceof TerminalMediaError
