import {
  type DatabaseClient,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  type ChannelType,
  channelTypes,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import type {
  AuthValue,
  ConnectionDescriptor,
  ConnectionKind,
} from "@chatbotx.io/sdk"
import { connectionAlreadyConnectedException } from "../errors"
import { logger } from "../logger"
import { workspaceMemberService } from "../workspace-member/service"
import type { ConnectionQuotaConsumption } from "./state-service"
import { connectionStateService } from "./state-service"
import type { ConnectionStoreBinding } from "./store-bindings"

/**
 * The FK a `Connection` row actually carries to its satellite row —
 * `inboxId` for channels, `integrationId` for workspace integrations. `null`
 * only for `chatbotx` (no satellite table at all).
 */
export const resolveForeignKey = (connection: ConnectionModel): string | null =>
  connection.inboxId ?? connection.integrationId ?? null

/**
 * `instagramFacebook`'s satellite table is shared with `instagram`
 * (`IntegrationInstagram`, disambiguated by its `type` column — see
 * `CONNECTION_STORE_BINDINGS`), but `Inbox.channel` has no matching
 * `instagramFacebook` value (`ChannelType` only has `instagram`) — every
 * other channel-kind `IntegrationType` literal is already a valid
 * `ChannelType`. Only called for `kind === "channel"` providers; validated
 * at runtime via `channelTypes.parse` (not an `as ChannelType` cast) so a
 * future `IntegrationType` added as `kind: "channel"` without a matching
 * `ChannelType` entry throws loudly here instead of silently writing an
 * invalid value to `Inbox.channel`.
 */
export const toChannelType = (provider: IntegrationType): ChannelType =>
  channelTypes.parse(provider === "instagramFacebook" ? "instagram" : provider)

/**
 * Resolves the workspace-owner user id for the FSM's quota edge —
 * `undefined` for anything but a `kind: "channel"` connection, since
 * `ConnectionStateService.transition`'s quota edge always targets the
 * `"channels"` metric. Passing an owner for a workspace-integration
 * connection (AI providers, marketing tools) would incorrectly
 * consume/release a channel-quota slot when that row crosses the
 * active/inactive boundary.
 */
export const resolveOwnerId = async (
  connection: Pick<ConnectionModel, "kind" | "workspaceId">,
): Promise<string | undefined> => {
  if (connection.kind !== "channel") {
    return
  }
  return await workspaceMemberService.findOwnerUserIdByWorkspaceId({
    workspaceId: connection.workspaceId,
  })
}

/**
 * Preserves the operation error when quota compensation fails after a
 * transaction rollback, while retaining the compensation failure in logs.
 */
export const withQuotaCompensation = async <T>(
  input: {
    ownerId: string | undefined
    quotaConsumption: ConnectionQuotaConsumption
    context: Record<string, unknown>
  },
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (err) {
    const { ownerId, quotaConsumption } = input
    if (quotaConsumption.consumed && quotaConsumption.workspaceId && ownerId) {
      try {
        await connectionStateService.compensateQuotaConsumption({
          ownerId,
          workspaceId: quotaConsumption.workspaceId,
          workspaceUsageIncremented: quotaConsumption.workspaceUsageIncremented,
        })
      } catch (compensationErr) {
        logger.error(
          {
            err: compensationErr,
            ...input.context,
            workspaceId: quotaConsumption.workspaceId,
            ownerId,
          },
          "connection: quota compensation failed",
        )
      }
    }
    throw err
  }
}

/**
 * Saves auth/config to an existing satellite row when its foreign key still
 * matches, otherwise recreates that satellite row. A disconnected
 * `delete_row` connection retains its stale foreign key after its satellite
 * is deleted, so a zero-row save must insert instead of silently succeeding.
 */
export const saveOrInsertSatellite = async (input: {
  tx: DatabaseClient
  workspaceId: string
  kind: ConnectionKind
  inboxId?: string | null
  auth: AuthValue
  descriptor: ConnectionDescriptor
  extraConfig: Record<string, unknown>
  existing?: ConnectionModel
  store: ConnectionStoreBinding
}): Promise<string | undefined> => {
  const existingForeignKey = input.existing
    ? resolveForeignKey(input.existing)
    : null
  if (
    existingForeignKey &&
    (await input.store.saveAuthByForeignKey(
      existingForeignKey,
      input.workspaceId,
      input.auth,
      input.extraConfig,
      input.tx,
    ))
  ) {
    return input.existing?.integrationId ?? undefined
  }

  try {
    if (input.kind === "channel") {
      if (!input.inboxId) {
        throw new Error("Channel connection requires an inbox ID")
      }
      const inserted = await input.store.insertRow(
        {
          kind: "channel",
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
          auth: input.auth,
          descriptor: input.descriptor,
          config: input.extraConfig,
        },
        input.tx,
      )
      return inserted.integrationId
    }
    const inserted = await input.store.insertRow(
      {
        kind: "integration",
        workspaceId: input.workspaceId,
        auth: input.auth,
        descriptor: input.descriptor,
        config: input.extraConfig,
      },
      input.tx,
    )
    return inserted.integrationId
  } catch (err) {
    if (
      input.store.duplicateConstraint &&
      isUniqueViolationError(err, input.store.duplicateConstraint)
    ) {
      throw connectionAlreadyConnectedException()
    }
    throw err
  }
}

/**
 * Writes (or revives) one `Connection` row plus its satellite row and runs
 * it through the FSM, inside a transaction the caller already owns —
 * `inboxId` (channel-kind) must already exist by the time this is called
 * (create it with `inboxService.create({ skipQuota: true })` first, since
 * this is the sole quota-consumption point for a brand-new channel via the
 * `connect.completed` transition edge). Shared by every direct (non-OAuth-
 * session) connect path: `@chatbotx.io/connections`'
 * `connectFromCredentials`/`connectAndPersist` call it wrapped in their own
 * transaction; a business-layer service already inside its own `tx` (api/
 * smtp/webchat/tiktok/zalo/whatsapp connect) calls it directly.
 */
export const upsertConnectionRow = async (input: {
  tx: DatabaseClient
  workspaceId: string
  provider: IntegrationType
  kind: ConnectionKind
  descriptor: ConnectionDescriptor
  auth: AuthValue
  extraConfig: Record<string, unknown>
  existing: ConnectionModel | undefined
  store: ConnectionStoreBinding
  ownerId: string | undefined
  quotaConsumption: ConnectionQuotaConsumption
  actorUserId?: string | null
  inboxId?: string | null
}): Promise<ConnectionModel> => {
  const {
    tx,
    workspaceId,
    provider,
    kind,
    descriptor,
    auth,
    extraConfig,
    existing,
    store,
    ownerId,
    actorUserId,
    inboxId,
  } = input

  const integrationId = await saveOrInsertSatellite({
    tx,
    workspaceId,
    kind,
    inboxId,
    auth,
    descriptor,
    extraConfig,
    existing,
    store,
  })

  if (existing) {
    await connectionRepository.update(
      {
        id: existing.id,
        workspaceId: existing.workspaceId,
        values: {
          // Keeps the revived row's identity in sync with the descriptor
          // just validated — a no-op for every provider whose `existing`
          // was found BY this exact `sourceId` (every current caller), but
          // required for a provider like `openaiCompatible` whose
          // `sourceId` IS its config (`baseURL`): without this, a revive
          // that also updates that config value via `saveAuthByForeignKey`
          // above would leave `Connection.sourceId` pointing at the stale
          // value, silently desyncing the two.
          sourceId: descriptor.sourceId,
          inboxId: inboxId ?? existing.inboxId,
          integrationId: integrationId ?? null,
          displayName: descriptor.displayName,
          lastError: null,
        },
      },
      tx,
    )
    return await connectionStateService.transition({
      connectionId: existing.id,
      event: "connect.completed",
      ownerId,
      tx,
      quotaConsumption: input.quotaConsumption,
    })
  }

  let created: ConnectionModel
  try {
    created = await connectionRepository.insert(
      {
        workspaceId,
        provider,
        kind,
        channel: kind === "channel" ? toChannelType(provider) : null,
        sourceId: descriptor.sourceId,
        displayName: descriptor.displayName,
        inboxId: inboxId ?? null,
        integrationId: integrationId ?? null,
        status: "disconnected",
        statusReason: "manual",
        disconnectedAt: new Date(),
        createdBy: actorUserId ?? null,
      },
      tx,
    )
  } catch (err) {
    if (
      isUniqueViolationError(
        err,
        "Connection_workspaceId_provider_sourceId_key",
      )
    ) {
      throw connectionAlreadyConnectedException()
    }
    throw err
  }
  return await connectionStateService.transition({
    connectionId: created.id,
    event: "connect.completed",
    ownerId,
    tx,
    quotaConsumption: input.quotaConsumption,
  })
}
