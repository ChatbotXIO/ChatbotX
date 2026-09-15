import {
  connectionStateService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { CONNECTION_REGISTRY } from "@chatbotx.io/connections"
import type {
  ChannelType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { integrationTypes } from "@chatbotx.io/database/partials"
import type { ConnectionModel } from "@chatbotx.io/database/types"
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
  kind?: "channel" | "integration" | "sub_connection"
  isSupportSession?: boolean
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
      .filter(
        (provider) =>
          !input.kind ||
          CONNECTION_REGISTRY[provider]?.provider.kind === input.kind,
      )
      .map((provider) =>
        resolveOneProvider({
          provider,
          policy,
          isSupportSession: input.isSupportSession ?? false,
          alreadyConnected: alreadyConnectedByProvider.has(provider),
          t,
        }),
      ),
  )
  return resources.filter(
    (resource): resource is ConnectionProviderResource => resource !== null,
  )
}

const resolveAlreadyConnectedProviders = async (
  workspaceId: string,
): Promise<Set<IntegrationType>> => {
  // Only distinct `provider` values matter here (deduped into the `Set`
  // below); 50 is the DB-level page-size cap (`maxLimit`) — comfortably
  // above the 30-value `IntegrationType` domain this loop iterates.
  const { data } = await connectionStateService.list({
    workspaceId,
    perPage: 50,
  })
  return new Set(data.map((row) => row.provider))
}

const resolveOneProvider = async (input: {
  provider: IntegrationType
  policy: Awaited<ReturnType<typeof resolveChannelPolicy>>
  isSupportSession: boolean
  alreadyConnected: boolean
  t: Awaited<ReturnType<typeof getTranslations>>
}): Promise<ConnectionProviderResource | null> => {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter) {
    return null
  }

  const configFields = adapter.provider.configFields.map((field) => ({
    name: field.name,
    type: field.type,
    required: field.required,
    label: input.t.has(field.labelKey) ? input.t(field.labelKey) : field.name,
    enumValues: field.enumValues ? [...field.enumValues] : undefined,
    description: field.description,
  }))

  const unavailableReason = await resolveUnavailableReason(input)

  return {
    provider: input.provider,
    kind: adapter.provider.kind,
    channel: (adapter.provider.kind === "channel"
      ? (channelForProvider(input.provider) ?? null)
      : null) as ChannelType | null,
    strategy: adapter.provider.strategy,
    multiAccount: adapter.provider.multiAccount,
    configFields,
    available: unavailableReason === null,
    unavailableReason,
  }
}

export const channelForProvider = (
  provider: IntegrationType,
): ChannelType | undefined => {
  const adapter = CONNECTION_REGISTRY[provider]
  if (adapter?.provider.kind !== "channel") {
    return
  }
  return provider === "instagramFacebook"
    ? "instagram"
    : (provider as ChannelType)
}

const CREDENTIAL_STRATEGIES = new Set(["token", "api_key", "self_serve"])

const resolveUnavailableReason = async (input: {
  provider: IntegrationType
  policy: Awaited<ReturnType<typeof resolveChannelPolicy>>
  isSupportSession: boolean
  alreadyConnected: boolean
}): Promise<ConnectionProviderResource["unavailableReason"]> => {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter) {
    return "notImplemented"
  }

  // A credential-strategy provider with no live `fromCredentials` validator
  // cannot complete `POST /v1/connections` — advertising it as `available`
  // would 500 on `connectionWrongStrategyException`. Webchat/SMTP/the API
  // channel are `self_serve` with no external account to validate against
  // AND no stable per-instance identity to derive `Connection.sourceId`
  // from (`describe()` only receives `auth`, which for these providers is
  // minted before any satellite row exists) — deferred to a follow-up that
  // resolves that identity gap rather than shipping a second "workspace"-
  // literal `sourceId` collision class.
  if (
    CREDENTIAL_STRATEGIES.has(adapter.provider.strategy) &&
    !adapter.provider.fromCredentials
  ) {
    return "notImplemented"
  }

  if (!(adapter.provider.multiAccount || !input.alreadyConnected)) {
    return "alreadyConnected"
  }

  const channel = channelForProvider(input.provider)
  if (
    channel &&
    input.policy &&
    !input.isSupportSession &&
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
