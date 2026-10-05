import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  CredentialType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import type {
  AuthValue,
  ConnectionProvider,
  Integration,
  IntegrationDefinition,
} from "@chatbotx.io/sdk"
import type { ConnectionStoreBinding } from "./store-bindings"

/**
 * Everything the Connection domain needs for one `IntegrationType`: the
 * runtime `Integration` wrapper (refresh/disconnect), the provider's
 * connect/verify/webhook adapter, and its DB store binding.
 * `@chatbotx.io/connections` assembles `Record<IntegrationType, ConnectionAdapter | null>`
 * from each `integrations/<provider>`'s `connection` export plus
 * `CONNECTION_STORE_BINDINGS` — `null` for types with no connect lifecycle
 * yet (for example `metaCatalog`, `outlookCalendar`, and `threads`).
 */
export type ConnectionAdapter = {
  /**
   * Present for every provider backed by an `integrations/<name>` SDK
   * package (channels + the OAuth2 marketing/calendar integrations).
   * Absent for credential-only AI-key providers (`claude`, `deepseek`,
   * `gemini`, `openrouter`, `openai`, `openaiCompatible`) that have no
   * `integrations/` package — their `ConnectionProvider.verify`/
   * `fromCredentials` call the provider API directly, with no SDK-level
   * message/webhook dispatch to wrap.
   */
  // biome-ignore lint/suspicious/noExplicitAny: definition generics vary per provider
  integration?: Integration<IntegrationDefinition<any, any, any>>
  /**
   * Each provider's `ConnectionProvider<SpecificAuth, SpecificCreds>` is
   * narrower than this field's declared type — the same heterogeneous-registry
   * tradeoff as `integration` above. Callers load the matching row's `auth`
   * for this exact provider, so the narrowing is safe at the call site even
   * though it isn't expressed in this shared type.
   */
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry, see comment above
  provider: ConnectionProvider<any, any>
  /**
   * Absent only for `chatbotx` — the internal built-in channel has no
   * `Integration<Chatbotx>` satellite table; the `Inbox` row itself is the
   * whole connection, so there is nothing for a store binding to load/insert.
   */
  store?: ConnectionStoreBinding
  credentialType?: CredentialType
  /**
   * Provider-specific teardown beyond the generic remote
   * disconnect/webhook-unsubscribe + store row delete the engine's
   * `disconnect` (`packages/connections/src/lifecycle.ts`) already performs.
   * Only Messenger defines one today (wired in
   * `packages/connections/src/registry.ts` from
   * `packages/connections/src/messenger-teardown.ts`): it preserves a
   * Facebook Page webhook subscription still shared with Instagram instead
   * of unsubscribing it, tears down coexist mode, and cleans up
   * `MetaCapiEvent`/tag rows the generic store binding doesn't know about.
   */
  teardown?: (input: {
    connection: ConnectionModel
    auth: AuthValue
  }) => Promise<{
    /**
     * `true` to skip the generic `integration.disconnect` +
     * `provider.webhook.unsubscribe` calls below — this hook already
     * handled (or deliberately preserved) the remote side.
     */
    skipGenericRemoteTeardown: boolean
    /** Runs inside the same transaction as the FSM transition + store row delete. */
    withinTransaction: (tx: DatabaseClient) => Promise<void>
  }>
}

export type ConnectionRegistry = Record<
  IntegrationType,
  ConnectionAdapter | null
>
