import type { TiktokAuthValue } from "../schema"

/**
 * The scopes the channel cannot exist without — identity plus Business
 * Messaging. A grant missing any of these produces a connection that cannot do
 * the one thing a TikTok inbox is for, so `callbackHandler` refuses it outright
 * rather than storing a channel that will fail on its first message.
 *
 * TikTok's consent screen lets a user untick individual permissions, so a
 * partial grant is an ordinary outcome of the connect flow, not an edge case.
 */
export const TIKTOK_CORE_SCOPES = [
  // `getUserInfo` asks for open_id, display_name and avatar_url…
  "user.info.basic",
  // …and username, which is its own scope.
  "user.info.username",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
] as const

/**
 * Requested so the profile is richer when granted, but never enforced: nothing
 * in the codebase reads a field behind any of them — `getUserInfo` asks only
 * for `open_id,display_name,avatar_url,username`.
 *
 * Kept out of {@link TIKTOK_CORE_SCOPES} deliberately. Refusing a connect over
 * a permission the product never uses would turn a cosmetic choice on TikTok's
 * consent screen into a hard failure, and would break every connect outright if
 * the app were not approved for them.
 */
export const TIKTOK_OPTIONAL_PROFILE_SCOPES = [
  "user.info.profile",
  "user.info.stats",
  "user.account.type",
] as const

/**
 * The scopes comment automation needs — held back until the TikTok app is
 * approved for them.
 *
 * `comment.list` is what makes TikTok deliver `comment.update` webhooks at all;
 * `video.list` backs the post picker. Requesting them before the app carries
 * the permission took the channel down: TikTok answered
 * `error=invalid_scope&error_type=scope` and refused the ENTIRE authorize
 * request rather than dropping the one scope it would not grant, so even a
 * workspace that only wanted DMs could no longer connect.
 *
 * The names are correct — a different platform's authorize request carries
 * `comment.list`, `comment.list.manage` and `video.list` and is accepted — so
 * what is missing is the approval on OUR app, not a better guess at the string.
 *
 * `comment.list.manage` is the write half that reply/like/hide/delete needs.
 * It was read off that working request rather than the public docs, which do
 * not name it; the read/write pairing matches `message.list.read` against
 * `message.list.send`/`message.list.manage`. Confirm it on the app's
 * Permissions page before relying on it.
 *
 * TODO(tiktok-comments): once the app's Permissions page in the TikTok
 * developer portal shows these approved, move them into
 * {@link TIKTOK_COMMENT_AUTOMATION_SCOPES} below. That one move turns the
 * feature on: the same list drives both the authorize request (`TIKTOK_SCOPES`
 * in `../apis/auth`) and the re-authorize warning.
 */
export const TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL = [
  "comment.list",
  "comment.list.manage",
  "video.list",
] as const

/**
 * The comment scopes actually requested today: none.
 *
 * Deliberately NOT part of {@link TIKTOK_CORE_SCOPES} even once populated. DMs
 * work without them, so refusing the connect over a missing one would leave a
 * DM-only workspace unable to connect at all; it surfaces as the re-authorize
 * warning on the settings list instead — see {@link tiktokNeedsReauthorization}.
 */
export const TIKTOK_COMMENT_AUTOMATION_SCOPES: readonly string[] = []

/** TikTok returns the granted scopes as one comma-separated string. */
export const parseTiktokScopes = (scope: string | undefined): string[] =>
  (scope ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

/**
 * Which of `required` the grant does not contain, in the order they were
 * declared — so an error message names them the way the developer portal does.
 *
 * Both the connect-time rejection and the re-authorize warning run through
 * this, so the two answers cannot drift apart.
 */
export const findMissingTiktokScopes = (
  granted: readonly string[],
  required: readonly string[],
): string[] => {
  const grantedSet = new Set(granted)
  return required.filter((scope) => !grantedSet.has(scope))
}

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
  // Nothing to warn about while no comment scope is requested. A connection
  // cannot be missing a permission it was never asked to grant, and a warning
  // that re-authorizing could not clear is noise on every row.
  if (TIKTOK_COMMENT_AUTOMATION_SCOPES.length === 0) {
    return false
  }

  const granted = auth.metadata?.scopes
  if (!granted) {
    return true
  }
  return (
    findMissingTiktokScopes(granted, TIKTOK_COMMENT_AUTOMATION_SCOPES).length >
    0
  )
}
