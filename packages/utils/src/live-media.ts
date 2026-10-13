import { keys } from "./keys"

const parseChannels = (value: string): Set<string> =>
  new Set(
    value
      .split(",")
      .map((channel) => channel.trim().toLowerCase())
      .filter(Boolean),
  )

// Read per call, not at import, so a redeploy with a changed flag and a stubbed
// env in tests both take effect without re-importing the module.

/** The channel's webhook keeps the provider's media URL instead of downloading. */
export const isLiveMediaLazyChannel = (channel: string): boolean =>
  parseChannels(keys().LIVE_MEDIA_LAZY_CHANNELS).has(channel.toLowerCase())

/** The channel's contacts are created without downloading their picture. */
export const isLazyAvatarChannel = (channel: string): boolean =>
  parseChannels(keys().LIVE_AVATAR_LAZY_CHANNELS).has(channel.toLowerCase())

/** Hosts Meta serves Messenger/Instagram media from (and accepts its page token on). */
export const META_MEDIA_HOSTS = [
  "fbcdn.net",
  "fbsbx.com",
  "cdninstagram.com",
  "facebook.com",
] as const

/** https and the host, or one of its subdomains, is in `hosts`. */
export const isUrlOnHosts = (
  url: string,
  hosts: readonly string[] | undefined,
): boolean => {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === "https:" &&
      (hosts ?? []).some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
    )
  } catch {
    return false
  }
}

/**
 * Whether a webhook may keep this media URL instead of downloading it: the
 * channel is lazy AND the URL is on the provider's own CDN. A stickers/GIF host
 * or shared link is not something the provider can serve again, so it stays on
 * the download path.
 */
export const isLiveMediaDeferrableUrl = (
  channel: string,
  url: string,
): boolean =>
  isLiveMediaLazyChannel(channel) && isUrlOnHosts(url, META_MEDIA_HOSTS)
