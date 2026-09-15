import type { AuthValue } from "./auth"
import type { Handler } from "./shared"

/**
 * How a connection is established. Kept as an open string-literal union so a
 * future strategy (QR login, device code, OAuth1, "paste callback URL") is
 * additive — a new literal here plus a new `ConnectNextAction.type`, never a
 * new table or a breaking change to `ConnectionProvider`.
 */
export type ConnectionStrategy =
  | "oauth_redirect"
  | "oauth_popup"
  | "token"
  | "api_key"
  | "self_serve"

/** One field of a provider's `config` (credential-strategy connect) or a post-connect action's `input`. */
export type ConnectionConfigField = {
  name: string
  type: "string" | "secret" | "number" | "boolean" | "enum" | "url"
  required: boolean
  labelKey: string
  enumValues?: readonly string[]
  description?: string
}

/** What the client must do next to continue a connect session. */
export type ConnectNextAction =
  | { type: "open_url"; url: string }
  | { type: "show_qr"; qr: string }
  | { type: "enter_input"; inputFields: ConnectionConfigField[] }
  | { type: "wait" }

export type ConnectionKind = "channel" | "integration" | "sub_connection"

export type ConnectionHealth =
  | { ok: true; authExpiresAt?: string }
  | { ok: false; revoked: boolean; error: string }

/** Human-facing identity of a connected account, derived from its auth/profile data. */
export type ConnectionDescriptor = {
  sourceId: string
  displayName: string
  authExpiresAt?: string
  avatarUrl?: string
}

/** One selectable target surfaced by `listCandidates` during a connect session — carries auth, never persisted as-is. */
export type ConnectionCandidate = ConnectionDescriptor & {
  alreadyConnected?: "this_workspace" | "other_workspace"
  auth: AuthValue
}

/** Opaque platform-credential input threaded through `authorizeUrl`/`exchangeCode` — shape is provider-specific, resolved by the business layer. */
export type ConnectionCredential = unknown

/**
 * Per-provider adapter the Connection domain drives to authorize, describe,
 * verify, and tear down a connection. `IAuth` is the provider's `AuthValue`
 * shape; `ICreds` is the shape of `config` for `token`/`api_key`/`self_serve`
 * strategies (never set for OAuth strategies).
 */
export type ConnectionProvider<
  IAuth extends AuthValue = AuthValue,
  // biome-ignore lint/suspicious/noExplicitAny: strategy-dependent credential shape
  ICreds = any,
> = {
  kind: ConnectionKind
  strategy: ConnectionStrategy
  multiAccount: boolean
  /** Drives `listConnectionProviders` and validates `config` for credential strategies. */
  configFields: readonly ConnectionConfigField[]
  describe: (auth: IAuth) => ConnectionDescriptor
  authorizeUrl?: (i: {
    credential: ConnectionCredential
    callbackUrl: string
    state: string
  }) => string
  /**
   * Returns `AuthValue`, not `IAuth` — for a single-account provider these
   * coincide, but a multi-account provider (Messenger Business Login) gets
   * back a *user*-level token here that is not yet any specific page's
   * `IAuth` (it has no `pageId` to satisfy `IAuth`'s narrower `metadata`
   * shape). `listCandidates` receives this same session-level value and is
   * what derives each candidate's own final `IAuth`; `describe`/`verify`/
   * `webhook`/`candidateToConfig` never see it.
   */
  exchangeCode?: Handler<
    { code: string; callbackUrl: string; credential: ConnectionCredential },
    AuthValue
  >
  listCandidates?: Handler<{ auth: AuthValue }, ConnectionCandidate[]>
  /**
   * Extra satellite-table columns a candidate's own `auth` carries beyond
   * `describe()`'s `{sourceId, displayName}` and the generic auth/tokens
   * shape — e.g. Instagram's `username` (its `auth.metadata` already has
   * `igId`/`pageId`, both covered by `describe()`/`identityColumn`, but the
   * satellite table's `username` column has no default and isn't part of
   * either). Read generically by `ConnectionService.connectTargets` and
   * passed straight through to `ConnectionStoreBinding.insertRow`'s
   * `config` — omit when a candidate's own `auth`/`descriptor` already
   * cover every NOT NULL column with no default.
   */
  candidateToConfig?: (auth: IAuth) => Record<string, unknown>
  /** Validates `token`/`api_key`/`self_serve` config with a live provider call. */
  fromCredentials?: Handler<ICreds, IAuth>
  verify: Handler<{ auth: IAuth }, ConnectionHealth>
  isRevokedTokenError: (error: unknown) => boolean
  webhook?: {
    subscribe: Handler<{ auth: IAuth }, void>
    unsubscribe: Handler<{ auth: IAuth }, void>
  }
  /**
   * Reserved for provider-specific post-connect verbs (WhatsApp
   * requestVerificationCode/verifyCode, Telegram setWebhook, …), exposed
   * later as `POST /v1/connections/{id}/actions/{name}`. Typed now so a
   * provider can start declaring one; no route consumes this in Phase 0-3.
   */
  actions?: Record<
    string,
    {
      inputFields: readonly ConnectionConfigField[]
      run: Handler<{ auth: IAuth; input: Record<string, unknown> }, unknown>
    }
  >
}
