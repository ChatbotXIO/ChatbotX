export const NO_AVATAR_SENTINEL_KEY = "public/img/no_avatar.jpg"
export const AVATAR_REFETCH_AFTER_MS = 10 * 60 * 1000

/**
 * Builder-served placeholder shown for a fresh no-avatar sentinel. Using this
 * guaranteed static asset (instead of finalizing the sentinel key) keeps the
 * avatar working even if the `public/img/no_avatar.jpg` object is not seeded in
 * a given tenant's storage bucket.
 */
export const DEFAULT_AVATAR_PLACEHOLDER_PATH = "/media/default-avatar.svg"

export const buildNoAvatarSentinel = (
  failedAtMs: number = Date.now(),
): string => `${NO_AVATAR_SENTINEL_KEY}?time=${failedAtMs}`

export const parseNoAvatarSentinel = (
  avatar: string,
): { failedAtMs: number } | null => {
  const prefix = `${NO_AVATAR_SENTINEL_KEY}?time=`
  if (!avatar.startsWith(prefix)) {
    return null
  }

  const failedAtMs = Number(avatar.slice(prefix.length))
  return { failedAtMs: Number.isFinite(failedAtMs) ? failedAtMs : 0 }
}

export const hasRealAvatar = (
  avatar: string | null | undefined,
): avatar is string => !!avatar && parseNoAvatarSentinel(avatar) === null

export const isNoAvatarSentinelFresh = (
  failedAtMs: number,
  now: number = Date.now(),
): boolean => failedAtMs <= now && now - failedAtMs < AVATAR_REFETCH_AFTER_MS
