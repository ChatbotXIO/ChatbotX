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
 * The scopes comment automation needs, on top of the core set.
 *
 * `comment.list` is what makes TikTok deliver `comment.update` webhooks at all,
 * so an account without it receives no comment events — silently, with a
 * connection that otherwise looks healthy.
 *
 * Deliberately NOT enforced at connect: DMs work perfectly well without these,
 * and refusing the whole channel would leave a DM-only workspace unable to
 * connect at all. A missing scope here surfaces as the re-authorize warning on
 * the settings list instead — see {@link tiktokNeedsReauthorization}.
 *
 * Nothing goes in this list before the app is approved for it. TikTok answers
 * `error=invalid_scope&error_type=scope` and refuses the ENTIRE authorize
 * request over one unapproved scope, so an eager entry here does not degrade
 * comment automation — it stops anyone connecting TikTok at all, DM-only
 * workspaces included. See {@link TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL}.
 */
export const TIKTOK_COMMENT_AUTOMATION_SCOPES = [
  // Delivers the `comment.update` webhook.
  "comment.list",
  // The write half: reply, like, hide, delete. Not named in the public docs —
  // taken from the live authorize requests of two other platforms on this API,
  // which pair it with `comment.list` the way `message.list.read` pairs with
  // `message.list.send`/`message.list.manage`, and since approved on the app.
  "comment.list.manage",
] as const

/**
 * Comment scopes the app is not approved for yet, so they are NOT requested.
 *
 * `video.list` backs the post picker, which is not built — the form takes video
 * ids by hand and `listTiktokVideos` has no caller. Requesting it broke the
 * connect flow in production for no gain.
 *
 * TODO(tiktok-comments): once approved, move it into
 * {@link TIKTOK_COMMENT_AUTOMATION_SCOPES}. That one move is the whole switch —
 * the same list drives the authorize request (`TIKTOK_SCOPES` in `../apis/auth`)
 * and the re-authorize warning.
 */
export const TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL = ["video.list"] as const

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
  const granted = auth.metadata?.scopes
  if (!granted) {
    return true
  }
  return (
    findMissingTiktokScopes(granted, TIKTOK_COMMENT_AUTOMATION_SCOPES).length >
    0
  )
}
