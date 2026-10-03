import type {
  ConnectionConfigField,
  ConnectionKind,
} from "@chatbotx.io/utils/connection"
import type { AuthValue } from "./auth"
import type { Handler } from "./shared"

/**
 * How a connection is established. Kept as an open string-literal union so a
 * future strategy (QR login, device code, OAuth1, "paste callback URL") is
 * additive — a new literal here plus a new `ConnectSessionNextAction.type`,
 * never a new table or a breaking change to `ConnectionProvider`.
 */
export type ConnectionStrategy =
  | "oauth_redirect"
  | "oauth_popup"
  | "token"
  | "api_key"
  | "self_serve"

export type {
  ConnectionConfigField,
  ConnectionKind,
  ConnectSessionNextAction,
} from "@chatbotx.io/utils/connection"

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

/** Provider-specific platform credential or direct connection input. */
export type ConnectionCredential = unknown

type ConnectionProviderCommon<IAuth extends AuthValue> = {
  kind: ConnectionKind
  configFields: readonly ConnectionConfigField[]
  describe: (auth: IAuth) => ConnectionDescriptor
  candidateToConfig?: (auth: IAuth) => Record<string, unknown>
  verify: Handler<{ auth: IAuth }, ConnectionHealth>
  isRevokedTokenError?: (error: unknown) => boolean
  webhook?: {
    subscribe: Handler<{ auth: IAuth }, void>
    unsubscribe: Handler<{ auth: IAuth }, void>
  }
}

type OAuthStrategy<ICreds> = {
  strategy: Extract<ConnectionStrategy, "oauth_redirect" | "oauth_popup">
  authorizeUrl: (input: {
    credential: ICreds
    callbackUrl: string
    state: string
  }) => string
  exchangeCode: Handler<
    { code: string; callbackUrl: string; credential: ICreds },
    AuthValue
  >
  fromCredentials?: never
}

type CredentialStrategy<IAuth extends AuthValue, ICreds> = {
  strategy: Extract<ConnectionStrategy, "token" | "api_key">
  authorizeUrl?: never
  exchangeCode?: never
  fromCredentials: Handler<ICreds, IAuth>
}

type SelfServeStrategy<IAuth extends AuthValue, ICreds> = {
  strategy: Extract<ConnectionStrategy, "self_serve">
  authorizeUrl?: never
  exchangeCode?: never
  fromCredentials?: Handler<ICreds, IAuth>
}

type MultiAccount = {
  multiAccount: true
  listCandidates: Handler<{ auth: AuthValue }, ConnectionCandidate[]>
}

type SingleAccount = {
  multiAccount: false
  listCandidates?: never
}

export type ConnectionProvider<
  IAuth extends AuthValue = AuthValue,
  ICreds = ConnectionCredential,
> = ConnectionProviderCommon<IAuth> &
  (
    | OAuthStrategy<ICreds>
    | CredentialStrategy<IAuth, ICreds>
    | SelfServeStrategy<IAuth, ICreds>
  ) &
  (MultiAccount | SingleAccount)
