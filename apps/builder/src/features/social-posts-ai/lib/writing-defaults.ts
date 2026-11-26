import type { SocialProvider } from "@chatbotx.io/utils/social-account"

/** The style toggles of "Write with AI". */
export type WritingToggles = {
  callToAction: boolean
  emoji: boolean
  hashtags: boolean
}

/** Networks where hashtags are on by default (Facebook and Threads: off). */
const HASHTAGS_BY_DEFAULT: ReadonlySet<SocialProvider> = new Set([
  "instagram",
  "tiktok",
])

/**
 * The toggles to start from for the networks a post goes to: hashtags on when
 * any network favours them, emoji on, call to action off. The same rule fills
 * the toggles an API caller omits and the composer's first state.
 */
export const defaultWritingToggles = (
  providers: readonly SocialProvider[],
): WritingToggles => ({
  callToAction: false,
  emoji: true,
  hashtags: providers.some((provider) => HASHTAGS_BY_DEFAULT.has(provider)),
})

/** Providers without duplicates, in a stable order. */
export const uniqueProviders = (
  providers: readonly SocialProvider[],
): SocialProvider[] => [...new Set(providers)].sort()
