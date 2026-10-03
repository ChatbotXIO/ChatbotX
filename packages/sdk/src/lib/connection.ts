import type {
  ConnectionKind,
  connectionConfigFieldSchema,
  connectSessionNextActionSchema,
} from "@chatbotx.io/utils/connection"
import type { z } from "zod"
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

export type ConnectionConfigField = z.infer<typeof connectionConfigFieldSchema>
export type ConnectNextAction = z.infer<typeof connectSessionNextActionSchema>
export type { ConnectionKind } from "@chatbotx.io/utils/connection"

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
   * Returns session-level auth. Multi-account providers finalize candidate
   * auth in `listCandidates`; reconnect paths may describe this value before
   * candidate metadata exists, so their descriptors must tolerate that shape.
   */
  exchangeCode?: Handler<
    { code: string; callbackUrl: string; credential: ConnectionCredential },
    AuthValue
  >
  listCandidates?: Handler<{ auth: AuthValue }, ConnectionCandidate[]>
  /** Maps candidate auth fields needed by provider-specific persistence. */
  candidateToConfig?: (auth: IAuth) => Record<string, unknown>
  /** Validates `token`/`api_key`/`self_serve` config with a live provider call. */
  fromCredentials?: Handler<ICreds, IAuth>
  verify: Handler<{ auth: IAuth }, ConnectionHealth>

  isRevokedTokenError?: (error: unknown) => boolean
  webhook?: {
    subscribe: Handler<{ auth: IAuth }, void>
    unsubscribe: Handler<{ auth: IAuth }, void>
  }
}
