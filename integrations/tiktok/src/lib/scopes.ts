import { TiktokMissingScopesError } from "../exception"
import type { TiktokAuthValue, TiktokChannelFeatures } from "../schema"

/** What every connection needs, whichever features its credential serves. */
export const TIKTOK_IDENTITY_SCOPES = [
  // `getUserInfo` asks for open_id, display_name and avatar_url…
  "user.info.basic",
  // …and username, which is its own scope.
  "user.info.username",
] as const

/**
 * Business Messaging. Never grantable to an account registered in the EEA,
 * Switzerland or the UK — which is what the `messaging` feature switch exists
 * for, see {@link TiktokChannelFeatures}.
 */
export const TIKTOK_MESSAGING_SCOPES = [
  "message.list.read",
  "message.list.send",
  "message.list.manage",
] as const

/**
 * The scopes a messaging connection cannot exist without — identity plus
 * Business Messaging. A grant missing any of these produces a connection that
 * cannot do the one thing a TikTok inbox is for, so both connect paths refuse
 * it outright rather than storing a channel that will fail on its first
 * message. A comments-only credential requires a different set — see
 * {@link tiktokRequiredScopes}.
 *
 * TikTok's consent screen lets a user untick individual permissions, so a
 * partial grant is an ordinary outcome of the connect flow, not an edge case.
 */
export const TIKTOK_CORE_SCOPES = [
  ...TIKTOK_IDENTITY_SCOPES,
  ...TIKTOK_MESSAGING_SCOPES,
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
 * NOT enforced at connect while messaging is on: DMs work perfectly well
 * without these, and refusing the whole channel would leave a DM-only workspace
 * unable to connect at all. A missing scope here surfaces as the re-authorize
 * warning on the settings list instead — see {@link tiktokNeedsReauthorization}.
 * With messaging off, comments are all the connection is for, so
 * {@link TIKTOK_COMMENT_CORE_SCOPES} become required.
 *
 * Nothing goes in this list before the app is approved for it. TikTok answers
 * `error=invalid_scope&error_type=scope` and refuses the ENTIRE authorize
 * request over one unapproved scope, so an eager entry here does not degrade
 * comment automation — it stops anyone connecting TikTok at all, DM-only
 * workspaces included. {@link TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL} is the
 * holding pen for anything not yet cleared.
 */
export const TIKTOK_COMMENT_CORE_SCOPES = [
  // Delivers the `comment.update` webhook.
  "comment.list",
  // The write half: reply, like, hide, delete. Not named in the public docs —
  // taken from the live authorize requests of two other platforms on this API,
  // which pair it with `comment.list` the way `message.list.read` pairs with
  // `message.list.send`/`message.list.manage`, and since approved on the app.
  "comment.list.manage",
] as const

export const TIKTOK_COMMENT_AUTOMATION_SCOPES = [
  ...TIKTOK_COMMENT_CORE_SCOPES,
  // `business/videos/list/`: the caption, thumbnail and share url behind the
  // post card an Inbox comment conversation sits on, and what a post picker
  // would read if one is built. Approved after the comment scopes, so every
  // connection made before then lacks it until its owner re-authorizes —
  // readers must degrade rather than fail. See {@link tiktokCanListVideos}.
  "video.list",
] as const

/**
 * Comment scopes the app is not approved for yet, so they are NOT requested.
 *
 * Empty today: `video.list`, the one entry this list ever held, has since been
 * approved and moved into {@link TIKTOK_COMMENT_AUTOMATION_SCOPES}. That one
 * move was the whole switch — the same list drives the authorize request
 * ({@link tiktokRequestedScopes}) and the re-authorize warning.
 *
 * Kept rather than deleted because it is the hook the authorize-request test
 * asserts against: the next scope the product wants goes here first, stays out
 * of the authorize request, and moves across only once the app carries it.
 */
export const TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL = [] as const

/**
 * Whether this connection may call `business/videos/list/`.
 *
 * The scope is approved and requested, but a grant is per-connection: every
 * account that authorized before the approval carries a scope list without it —
 * the same population {@link tiktokNeedsReauthorization} flags — so a caller
 * still needs a path that works without it. Reading the granted set rather than
 * the constant is what makes the answer flip on its own once an owner
 * re-authorizes, with no deploy in between.
 */
export const tiktokCanListVideos = (auth: {
  metadata?: TiktokAuthValue["metadata"] | undefined
}): boolean => (auth.metadata?.scopes ?? []).includes("video.list")

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
  // The credential never asked for comment scopes, so their absence is the
  // grant working as configured, not a stale one.
  if (auth.metadata?.features?.comments === false) {
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

/**
 * Fills in the defaults for a credential's features. A credential saved before
 * features existed carries none, and must keep behaving exactly as it did:
 * both on.
 */
export const resolveTiktokFeatures = (
  features: Partial<TiktokChannelFeatures> | undefined,
): TiktokChannelFeatures => ({
  messaging: features?.messaging ?? true,
  comments: features?.comments ?? true,
})

/**
 * The scopes a grant must hold for the connect to be accepted — the one answer
 * both connect paths (`exchangeCode` and `callbackHandler`) check against.
 *
 * With messaging on, that is {@link TIKTOK_CORE_SCOPES} and the comment scopes
 * stay optional. With messaging off, comments are the only thing the
 * connection is for, so {@link TIKTOK_COMMENT_CORE_SCOPES} take the messaging
 * scopes' place — a comments-only grant without `comment.list` would receive
 * nothing at all.
 */
export const tiktokRequiredScopes = (
  features: Partial<TiktokChannelFeatures> | undefined,
): readonly string[] =>
  resolveTiktokFeatures(features).messaging
    ? TIKTOK_CORE_SCOPES
    : [...TIKTOK_IDENTITY_SCOPES, ...TIKTOK_COMMENT_CORE_SCOPES]

/**
 * The `scope` parameter of the authorize request.
 *
 * Only what the enabled features use is asked for. That matters for messaging
 * in particular: an EEA, Swiss or UK account can never grant `message.list.*`,
 * so a comments-only credential must not put them on the consent screen at
 * all.
 */
export const tiktokRequestedScopes = (
  features: Partial<TiktokChannelFeatures> | undefined,
): string => {
  const { messaging, comments } = resolveTiktokFeatures(features)
  return [
    ...TIKTOK_IDENTITY_SCOPES,
    ...(messaging ? TIKTOK_MESSAGING_SCOPES : []),
    ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
    ...(comments ? TIKTOK_COMMENT_AUTOMATION_SCOPES : []),
  ].join(",")
}

/**
 * Checks a token exchange's grant against what the credential's features
 * require, and returns what the connection's `metadata` should record.
 *
 * Both connect paths run through this, so neither can drift to a different
 * rule. Throws {@link TiktokMissingScopesError} on a partial grant — TikTok's
 * consent screen lets a user untick individual permissions — before anything
 * is persisted, so a refused connect leaves no half-connected channel behind.
 */
export const assertTiktokGrant = (
  scope: string | undefined,
  features: Partial<TiktokChannelFeatures> | undefined,
): { scopes: string[]; features: TiktokChannelFeatures } => {
  const scopes = parseTiktokScopes(scope)
  const missing = findMissingTiktokScopes(
    scopes,
    tiktokRequiredScopes(features),
  )
  if (missing.length > 0) {
    throw new TiktokMissingScopesError(missing)
  }
  return { scopes, features: resolveTiktokFeatures(features) }
}

/**
 * Whether this connection may send DMs — the private reply to a comment
 * included, which TikTok delivers as a message.
 *
 * Read from the features stamped at connect, NOT from `metadata.scopes`: both
 * token-refresh paths re-stamp the scope list from TikTok's refresh response,
 * so an empty or partial answer there would silently turn a working DM
 * connection into a refused one. A connection with messaging on cannot lack
 * the messaging scopes — the connect refuses that grant — and one made before
 * features existed was connected with messaging required.
 */
export const tiktokCanMessage = (auth: {
  metadata?: TiktokAuthValue["metadata"] | undefined
}): boolean => auth.metadata?.features?.messaging !== false
