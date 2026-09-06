/**
 * Graph returns `tos_accepted` as a map of term name -> flag. Meta's docs do
 * not pin the key for the custom-audience terms and the spelling has differed
 * between accounts, so both known spellings are checked. An absent map means
 * "not accepted" — that is the state the remediation link fixes, so failing
 * closed is correct (spec O1).
 */
const CUSTOM_AUDIENCE_TOS_KEYS = [
  "custom_audience_tos",
  "web_custom_audience_tos",
] as const

export function isCustomAudienceTosAccepted(
  tosAccepted?: Record<string, number>,
): boolean {
  return CUSTOM_AUDIENCE_TOS_KEYS.some(
    (key) => Number(tosAccepted?.[key] ?? 0) > 0,
  )
}

/** Hoisted to module scope: Biome forbids a regex literal inside a function. */
const ACT_PREFIX = /^act_/

/** `account_id` is the BARE id — Graph's `id` field carries an `act_` prefix. */
export function customAudienceTosUrl(accountId: string): string {
  const bare = accountId.replace(ACT_PREFIX, "")
  return `https://business.facebook.com/ads/manage/customaudiences/tos/?act=${bare}`
}
