import type { ScopeRecheckOps } from "@chatbotx.io/business"
import { readTokenScopes as readInstagramFacebookScopes } from "@chatbotx.io/integration-instagram-facebook/apis/token-scopes"
import { readTokenScopes as readMessengerScopes } from "@chatbotx.io/integration-messenger/apis/token-scopes"
import type {
  PublishScopeRecheckSource,
  ScopeReadResult,
} from "@chatbotx.io/utils/publish-destination"
import { PUBLISH_SCOPE_RECHECK_SOURCE } from "@chatbotx.io/utils/publish-destination"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"

type AppAuth = { appAccessToken: string; version?: string }

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

/**
 * The app access token (`APP_ID|APP_SECRET`) and Graph version of the app that
 * minted a stored token, from the integration's own `auth`; `null` when it
 * carries no app credentials.
 */
const readAppAuth = (auth: unknown): AppAuth | null => {
  const record = asRecord(auth)
  const clientId = nonEmptyString(record?.clientId)
  const clientSecret = nonEmptyString(record?.clientSecret)
  if (!(clientId && clientSecret)) {
    return null
  }
  const version =
    nonEmptyString(record?.version) ??
    nonEmptyString(asRecord(record?.metadata)?.version) ??
    undefined
  return { appAccessToken: `${clientId}|${clientSecret}`, version }
}

type ScopeReader = (input: {
  accessToken: string
  auth: unknown
}) => Promise<ScopeReadResult>

const FAILED: ScopeReadResult = { kind: "failed" }

/** `debug_token` of the stored token, inspected with the app access token of the app that minted it. */
const debugTokenReader =
  (read: typeof readMessengerScopes): ScopeReader =>
  async ({ accessToken, auth }) => {
    const app = readAppAuth(auth)
    if (!app) {
      return FAILED
    }
    return await read({ ...app, inputToken: accessToken })
  }

/** One reader per documented source (`PUBLISH_SCOPE_RECHECK_SOURCE`); the network picks its variant below. */
const READERS_BY_PUBLISHER: Record<PublisherKey, ScopeReader | null> = {
  facebook: debugTokenReader(readMessengerScopes),
  instagram: null,
  instagramFacebook: debugTokenReader(readInstagramFacebookScopes),
  threads: null,
  tiktok: null,
}

/** Sources every non-null reader implements (keeps the two tables in step). */
const IMPLEMENTED_SOURCES: readonly PublishScopeRecheckSource[] = ["debugToken"]

/**
 * The network calls behind a destination's permission re-check, for the worker
 * job. A publisher with no documented source (`PUBLISH_SCOPE_RECHECK_SOURCE`
 * is `null`) is answered "unreported" without a call.
 */
export const createPublishScopeOps = (): ScopeRecheckOps => ({
  readScopes: async ({ accessToken, auth, publisherKey }) => {
    const source = PUBLISH_SCOPE_RECHECK_SOURCE[publisherKey]
    const reader = READERS_BY_PUBLISHER[publisherKey]
    if (!(source && reader && IMPLEMENTED_SOURCES.includes(source))) {
      return { kind: "unreported" }
    }
    return await reader({ accessToken, auth })
  },
})
