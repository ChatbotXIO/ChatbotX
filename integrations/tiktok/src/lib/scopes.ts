import type { TiktokAuthValue } from "../schema"

/**
 * The scopes comment automation cannot work without.
 *
 * `comment.list` is what makes TikTok deliver `comment.update` webhooks at all,
 * so an account authorized before comment automation shipped receives no
 * comment events — silently, with a connection that otherwise looks healthy.
 *
 * TODO(tiktok-comments): add the write scope here once its identifier is read
 * off the app's Permissions page in the TikTok developer portal — see
 * `TIKTOK_SCOPES` in `../apis/auth`. Until then this list only detects the
 * accounts that cannot RECEIVE comments, not the ones that cannot reply.
 */
export const TIKTOK_COMMENT_AUTOMATION_SCOPES = ["comment.list"] as const

/** TikTok returns the granted scopes as one comma-separated string. */
export const parseTiktokScopes = (scope: string | undefined): string[] =>
  (scope ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

/**
 * Whether the connection has to go through the authorize flow again before
 * comment automation can run on it.
 *
 * A connection made before scopes were recorded carries no `metadata.scopes`,
 * and that unknown counts as "needs re-authorization": it is exactly the
 * population this predicate exists to surface, and a refresh re-stamps the real
 * list on the next cron run, so a connection that does hold the scope stops
 * being flagged on its own.
 */
export const tiktokNeedsReauthorization = (auth: {
  metadata?: TiktokAuthValue["metadata"] | undefined
}): boolean => {
  const granted = auth.metadata?.scopes
  if (!granted) {
    return true
  }
  const grantedSet = new Set(granted)
  return TIKTOK_COMMENT_AUTOMATION_SCOPES.some(
    (scope) => !grantedSet.has(scope),
  )
}
