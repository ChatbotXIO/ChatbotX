import { signMediaToken } from "@chatbotx.io/encryption"
import { logger } from "../logger"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import {
  DEFAULT_AVATAR_PLACEHOLDER_PATH,
  hasRealAvatar,
  isNoAvatarSentinelFresh,
  parseNoAvatarSentinel,
} from "./no-avatar-sentinel"

export const HYDRATION_CHANNELS = new Set([
  "messenger",
  "instagram",
  "whatsapp",
])

export const AVATAR_HYDRATION_CHANNELS = new Set(["messenger", "instagram"])
export const FAILED_PREFIX = "failed:"
export const WA_MEDIA_PREFIX = "wa-media:"

type AttachmentMediaRef = {
  kind: "attachment"
  workspaceId: string
  attachmentId: string
  originPath: string
  channel: string
  // Parent message createdAt — signed into the proxy token so the on-demand
  // lookup can target the right shard window on a sharded deployment.
  messageCreatedAt?: Date
}

type AvatarMediaRef = {
  kind: "avatar"
  workspaceId: string
  contactInboxId: string
  channel: string
  avatar: string | null
}

export type MediaRef = AttachmentMediaRef | AvatarMediaRef

export type FinalizeMediaUrl = (r2Key: string) => string | Promise<string>

export type EnsureAvatarMirrored = (input: {
  contactInboxId: string
  workspaceId: string
}) => Promise<{ avatar: string } | null>

type AvatarContact = {
  avatar: string | null
}

type AvatarContactInbox = {
  id: string
  channel: string
  lastMessageAt?: Date | string | null
}

type ResolveContactAvatarUrlInput = {
  workspaceId: string
  contact: AvatarContact
  contactInbox?: AvatarContactInbox | null
  contactInboxes?: readonly AvatarContactInbox[]
}

export const isPendingOriginPath = (originPath: string): boolean =>
  originPath.startsWith("http://") ||
  originPath.startsWith("https://") ||
  originPath.startsWith(WA_MEDIA_PREFIX)

export const isFailedOriginPath = (originPath: string): boolean =>
  originPath.startsWith(FAILED_PREFIX)

const buildProxyUrl = async (props: {
  kind: "attachment" | "avatar"
  refId: string
  workspaceId: string
  messageCreatedAt?: number
}): Promise<string> => {
  const token = await signMediaToken(props)
  // White-label: proxied media must resolve on the workspace's own (custom)
  // domain, not the platform default, so the branded origin is preserved for
  // tenants on a custom domain. resolveWorkspaceAppUrl is withCache-backed, so
  // repeat lookups while resolving a list of pending media stay cheap.
  const appUrl = await resolveWorkspaceAppUrl({
    workspaceId: props.workspaceId,
  })
  return new URL(`/media/${props.kind}/${token}`, appUrl).toString()
}

// Fresh no-avatar sentinel → the guaranteed placeholder asset on the
// workspace's own (white-label) domain, so a missing tenant `no_avatar.jpg`
// object never surfaces as a broken image.
const resolveDefaultAvatarUrl = async (workspaceId: string): Promise<string> =>
  new URL(
    DEFAULT_AVATAR_PLACEHOLDER_PATH,
    await resolveWorkspaceAppUrl({ workspaceId }),
  ).toString()

// Turn a stored avatar value into a URL: a real key finalizes to its durable
// location, a no-avatar sentinel resolves to the guaranteed placeholder (never
// a maybe-missing sentinel key).
const finalizeAvatarOrPlaceholder = (
  avatar: string,
  workspaceId: string,
  finalize: FinalizeMediaUrl,
): Promise<string> | string =>
  hasRealAvatar(avatar)
    ? finalize(avatar)
    : resolveDefaultAvatarUrl(workspaceId)

const resolveAttachmentUrl = async (
  ref: AttachmentMediaRef,
  finalize: FinalizeMediaUrl,
): Promise<string | null> => {
  if (isFailedOriginPath(ref.originPath)) {
    return null
  }
  if (
    HYDRATION_CHANNELS.has(ref.channel) &&
    isPendingOriginPath(ref.originPath)
  ) {
    return await buildProxyUrl({
      kind: "attachment",
      refId: ref.attachmentId,
      workspaceId: ref.workspaceId,
      messageCreatedAt: ref.messageCreatedAt?.getTime(),
    })
  }
  return await finalize(ref.originPath)
}

const resolveAvatarUrl = async (
  ref: AvatarMediaRef,
  finalize: FinalizeMediaUrl,
  ensureMirrored?: EnsureAvatarMirrored,
): Promise<string | null> => {
  if (ref.avatar) {
    const sentinel = parseNoAvatarSentinel(ref.avatar)
    if (!sentinel) {
      return await finalize(ref.avatar)
    }
    if (isNoAvatarSentinelFresh(sentinel.failedAtMs)) {
      return await resolveDefaultAvatarUrl(ref.workspaceId)
    }
  }
  if (!AVATAR_HYDRATION_CHANNELS.has(ref.channel)) {
    return null
  }
  if (ensureMirrored) {
    try {
      const mirrored = await ensureMirrored({
        contactInboxId: ref.contactInboxId,
        workspaceId: ref.workspaceId,
      })
      if (!mirrored) {
        return null
      }
      return await finalizeAvatarOrPlaceholder(
        mirrored.avatar,
        ref.workspaceId,
        finalize,
      )
    } catch (err) {
      logger.warn(
        {
          err,
          contactInboxId: ref.contactInboxId,
          workspaceId: ref.workspaceId,
        },
        "Synchronous avatar mirror failed; omitting avatar",
      )
      return null
    }
  }
  return await buildProxyUrl({
    kind: "avatar",
    refId: ref.contactInboxId,
    workspaceId: ref.workspaceId,
  })
}

export const resolveMediaUrl = async (
  ref: MediaRef,
  finalize: FinalizeMediaUrl,
  ensureMirrored?: EnsureAvatarMirrored,
): Promise<string | null> => {
  if (ref.kind === "attachment") {
    return await resolveAttachmentUrl(ref, finalize)
  }
  return await resolveAvatarUrl(ref, finalize, ensureMirrored)
}

const selectAvatarContactInbox = (
  contactInboxes: readonly AvatarContactInbox[],
): AvatarContactInbox | undefined =>
  contactInboxes
    .filter((contactInbox) =>
      AVATAR_HYDRATION_CHANNELS.has(contactInbox.channel),
    )
    .toSorted(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    )[0] ?? contactInboxes[0]

export const resolveContactAvatarUrl = async (
  input: ResolveContactAvatarUrlInput,
  finalize: FinalizeMediaUrl,
  ensureMirrored?: EnsureAvatarMirrored,
): Promise<string | null> => {
  const contactInboxes =
    input.contactInboxes ?? (input.contactInbox ? [input.contactInbox] : [])
  const contactInbox = selectAvatarContactInbox(contactInboxes)

  if (!contactInbox) {
    // No inbox to rehydrate from: a real key finalizes, a sentinel (fresh or
    // stale) resolves to the placeholder rather than a maybe-missing key.
    if (!input.contact.avatar) {
      return null
    }
    return await finalizeAvatarOrPlaceholder(
      input.contact.avatar,
      input.workspaceId,
      finalize,
    )
  }

  return await resolveMediaUrl(
    {
      kind: "avatar",
      workspaceId: input.workspaceId,
      contactInboxId: contactInbox.id,
      channel: contactInbox.channel,
      avatar: input.contact.avatar,
    },
    finalize,
    ensureMirrored,
  )
}
