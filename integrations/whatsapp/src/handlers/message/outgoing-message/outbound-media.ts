import { resolveOutboundMediaUrl } from "@chatbotx.io/business/outbound-media"

type MediaKind = "image" | "video" | "audio"

const MB = 1024 * 1024

/**
 * Media types and size caps the Cloud API accepts for a media link. Meta
 * fetches the link and checks the `Content-Type` it is served with, so a host
 * answering `image/jpg` fails with error 131053.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#supported-media-types
 */
export const WHATSAPP_MEDIA_RULES: Record<
  MediaKind,
  { allowedMimeTypes: readonly string[]; maxBytes: number }
> = {
  image: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * MB,
  },
  video: { allowedMimeTypes: ["video/mp4", "video/3gpp"], maxBytes: 16 * MB },
  audio: {
    allowedMimeTypes: [
      "audio/aac",
      "audio/amr",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
    ],
    maxBytes: 16 * MB,
  },
}

const isMediaKind = (value: unknown): value is MediaKind =>
  typeof value === "string" && value in WHATSAPP_MEDIA_RULES

type LinkHolder = { link: string }

const hasLink = (value: unknown): value is LinkHolder =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { link?: unknown }).link === "string"

/**
 * Every `{ link }` media object in an outgoing payload, with its kind. Covers
 * the top-level `whatsapp-api-js` media classes (kind from the `_type`
 * getter) and media nested under an `image`/`video`/`audio` key — interactive
 * headers, template header/body parameters and raw carousel cards.
 */
export const collectMediaLinks = (
  message: unknown,
): { holder: LinkHolder; kind: MediaKind }[] => {
  const found: { holder: LinkHolder; kind: MediaKind }[] = []
  const seen = new WeakSet<object>()

  const visit = (value: unknown, parentKey: string | null): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) {
      return
    }
    seen.add(value)

    if (hasLink(value)) {
      const ownType = (value as { _type?: unknown })._type
      const kind = isMediaKind(ownType) ? ownType : parentKey
      if (isMediaKind(kind)) {
        found.push({ holder: value, kind })
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, parentKey)
      }
      return
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, key)
    }
  }

  visit(message, null)
  return found
}

/**
 * Rewrites, in place, each media link of an outgoing message to a URL
 * WhatsApp can fetch (see `resolveOutboundMediaUrl`). Mutating is safe even if
 * a payload shares objects with step data: the new value is the original link
 * or a copy on our own storage, which the resolver passes through unchanged.
 */
export const prepareOutboundMedia = async (
  message: unknown,
  ctx: { storagePrefix: string; platform?: { storageUrl: string } },
): Promise<void> => {
  // Without a storage target there is nowhere to re-host to; send as-is
  // rather than fail the message.
  const storageUrl = ctx.platform?.storageUrl
  if (!(storageUrl && ctx.storagePrefix)) {
    return
  }
  const links = collectMediaLinks(message)
  await Promise.all(
    links.map(async ({ holder, kind }) => {
      holder.link = await resolveOutboundMediaUrl({
        url: holder.link,
        ...WHATSAPP_MEDIA_RULES[kind],
        storagePrefix: ctx.storagePrefix,
        storageUrl,
      })
    }),
  )
}
