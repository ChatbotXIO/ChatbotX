import {
  connectionStateService,
  platformCredentialService,
} from "@chatbotx.io/business"
import {
  CONNECTION_REGISTRY,
  isCredentialStrategy,
  toChannelType,
} from "@chatbotx.io/connections"
import type {
  ChannelType,
  ConnectionKind,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  ACTIVE_CONNECTION_STATUSES,
  INACTIVE_CONNECTION_STATUSES,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import type { ConnectionConfigField } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"
import type {
  ConnectionProviderResource,
  ConnectionResource,
} from "../schema/resource"

/** Turns a `Connection` row into its public/private DTO — `capabilities` is joined from `CONNECTION_REGISTRY`, never stored on the row. */
export const toConnectionResource = (
  row: ConnectionModel,
): ConnectionResource => {
  const adapter = CONNECTION_REGISTRY[row.provider]
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    channel: row.channel,
    status: row.status,
    statusReason: row.statusReason,
    sourceId: row.sourceId,
    displayName: row.displayName,
    inboxId: row.inboxId,
    integrationId: row.integrationId,
    strategy: adapter?.provider.strategy ?? "self_serve",
    capabilities: {
      refreshable: Boolean(adapter?.integration?.refreshAuth),
      verifiable: Boolean(adapter?.provider.verify),
      multiAccount: adapter?.provider.multiAccount ?? false,
    },
    authExpiresAt: row.authExpiresAt?.toISOString() ?? null,
    lastError: row.lastError,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Builds the `GET /v1/connection-providers` catalog: every `IntegrationType`,
 * with `available`/`unavailableReason` resolved against this workspace
 * (hidden-channel policy, an existing single-account connection, or a
 * missing platform credential). `resolveChannelPolicy`'s `ownerId` is the
 * tenant-aware credential owner for every provider, not just channels — it's
 * reused here rather than a second `resolveOwnerForWorkspace` read.
 */
export const listConnectionProviderResources = async (input: {
  workspaceId: string
  kind?: ConnectionKind
}): Promise<ConnectionProviderResource[]> => {
  const [t, policy] = await Promise.all([
    getTranslations(),
    resolveChannelPolicy(input.workspaceId),
  ])

  const alreadyConnectedByProvider = await resolveAlreadyConnectedProviders(
    input.workspaceId,
  )

  const resources = await Promise.all(
    integrationTypes.options
      // `facebookAds` is registered with `credentialType: "messenger"` (reuses
      // the Messenger OAuth app) but resolves its own `/integrations/
      // facebook-ads/callback` redirect_uri (`resolve-connect-credential.ts`'s
      // `OAUTH_CALLBACK_SLUG`), which has not been confirmed allow-listed with
      // Meta. Excluded from the public catalog until that's verified or the
      // callback is relayed through Messenger's already-registered redirect_uri.
      .filter((provider) => provider !== "facebookAds")
      .filter(
        (provider) =>
          !input.kind ||
          CONNECTION_REGISTRY[provider]?.provider.kind === input.kind,
      )
      .map((provider) =>
        resolveOneProvider({
          provider,
          policy,
          alreadyConnected: alreadyConnectedByProvider.has(provider),
          t,
        }),
      ),
  )
  return resources.filter(
    (resource): resource is ConnectionProviderResource => resource !== null,
  )
}

/**
 * A `disconnected` row is fully torn down and must not block a fresh
 * connect — only a row still in some other status (`connected`/`degraded`/
 * `needs_reauth`/`paused`) represents an existing slot for its provider.
 */
const NON_DISCONNECTED_STATUSES = [
  ...ACTIVE_CONNECTION_STATUSES,
  ...INACTIVE_CONNECTION_STATUSES.filter((status) => status !== "disconnected"),
]

const resolveAlreadyConnectedProviders = async (
  workspaceId: string,
): Promise<Set<IntegrationType>> => {
  const providers = await connectionStateService.listProvidersWithStatus({
    workspaceId,
    statuses: NON_DISCONNECTED_STATUSES,
  })
  return new Set(providers)
}

const resolveOneProvider = async (input: {
  provider: IntegrationType
  policy: Awaited<ReturnType<typeof resolveChannelPolicy>>
  alreadyConnected: boolean
  t: Awaited<ReturnType<typeof getTranslations>>
}): Promise<ConnectionProviderResource | null> => {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter) {
    return null
  }

  const configFields = adapter.provider.configFields.map(
    (field: ConnectionConfigField) => ({
      name: field.name,
      type: field.type,
      required: field.required,
      label:
        field.labelKey && input.t.has(field.labelKey)
          ? input.t(field.labelKey)
          : field.name,
      enumValues: field.enumValues ? [...field.enumValues] : undefined,
      items: field.items
        ? {
            ...field.items,
            fields: field.items.fields ? [...field.items.fields] : undefined,
          }
        : undefined,
      description: field.description,
    }),
  )

  const unavailableReason = await resolveUnavailableReason(input)

  return {
    provider: input.provider,
    kind: adapter.provider.kind,
    channel: (adapter.provider.kind === "channel"
      ? toChannelType(input.provider)
      : null) as ChannelType | null,
    strategy: adapter.provider.strategy,
    multiAccount: adapter.provider.multiAccount,
    multiInstance: adapter.provider.multiInstance ?? false,
    configFields,
    available: unavailableReason === null,
    unavailableReason,
  }
}

const resolveUnavailableReason = async (input: {
  provider: IntegrationType
  policy: Awaited<ReturnType<typeof resolveChannelPolicy>>
  alreadyConnected: boolean
}): Promise<ConnectionProviderResource["unavailableReason"]> => {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter) {
    return "notImplemented"
  }

  // Only credential-strategy providers with neither a live credential
  // validator nor a self-serve adapter handler are unavailable. SMTP and
  // ChatbotX remain deferred; webchat and API create their own satellite row.
  if (
    isCredentialStrategy(adapter.provider.strategy) &&
    !adapter.provider.fromCredentials &&
    !adapter.connect
  ) {
    return "notImplemented"
  }

  if (
    !(
      adapter.provider.multiAccount ||
      adapter.provider.multiInstance ||
      !input.alreadyConnected
    )
  ) {
    return "alreadyConnected"
  }

  const channel =
    adapter.provider.kind === "channel"
      ? toChannelType(input.provider)
      : undefined
  if (
    channel &&
    input.policy &&
    !input.policy.visibleChannels.includes(channel)
  ) {
    return "hiddenForTenant"
  }

  if (adapter.credentialType && input.policy) {
    const credential = await platformCredentialService.resolveForOwner({
      ownerId: input.policy.ownerId,
      type: adapter.credentialType,
    })
    if (!credential) {
      return "credentialMissing"
    }
  }

  return null
}
