import { workspaceMemberService } from "@chatbotx.io/business"
import {
  type ConnectionAdapter,
  connectionStateService,
} from "@chatbotx.io/business/connection"
import {
  connectionAlreadyConnectedException,
  connectionNotConfiguredException,
  notFoundException,
  validationException,
} from "@chatbotx.io/business/errors"
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
  ConnectionCandidate,
  ConnectionConfigField,
  ConnectionDescriptor,
  ConnectionKind,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { logger } from "./logger"
import { CONNECTION_REGISTRY } from "./registry"

/**
 * What a session's `encryptedAuth` blob actually holds once
 * `completeAuthorization` lists candidates: the full `ConnectionCandidate[]`
 * (each with its own `auth`), not just the single exchanged `auth` — a
 * multi-account provider (Messenger) hands back one distinct per-page auth
 * per candidate. `auth` itself is provider-specific and unvalidated here
 * (same trust boundary as `asAuthValue` in `store-bindings.ts`); everything
 * else mirrors `ConnectSessionTarget`.
 */
export const encryptedCandidatesSchema = z.array(
  z.object({
    sourceId: z.string(),
    displayName: z.string(),
    authExpiresAt: z.string().optional(),
    avatarUrl: z.string().optional(),
    alreadyConnected: z.enum(["this_workspace", "other_workspace"]).optional(),
    auth: z.custom<AuthValue>(),
  }),
) satisfies z.ZodType<ConnectionCandidate[]>

/**
 * The FK a `Connection` row actually carries to its satellite row —
 * `inboxId` for channels, `integrationId` for workspace integrations. `null`
 * only for `chatbotx` (no satellite table at all).
 */
export const resolveForeignKey = (connection: ConnectionModel): string | null =>
  connection.inboxId ?? connection.integrationId ?? null

/**
 * Validates a raw `config` object (a credential-strategy `connect` request
 * body) against a provider's `configFields` declaration, coercing each
 * value to its declared type. Throws the same `validationException` shape
 * every other service uses, field-scoped, so a public/private API caller
 * can attach it to the right form field without special-casing this path.
 */
export const parseConfig = (
  configFields: readonly ConnectionConfigField[],
  rawConfig: Record<string, unknown>,
): Record<string, unknown> => {
  const parsed: Record<string, unknown> = {}
  for (const field of configFields) {
    const value = rawConfig[field.name]
    if (value === undefined || value === null || value === "") {
      if (field.required) {
        throw validationException(field.name, `${field.name} is required`)
      }
      continue
    }
    switch (field.type) {
      case "string":
      case "secret":
      case "url":
        if (typeof value !== "string") {
          throw validationException(
            field.name,
            `${field.name} must be a string`,
          )
        }
        parsed[field.name] = value
        break
      case "number": {
        const num = typeof value === "number" ? value : Number(value)
        if (Number.isNaN(num)) {
          throw validationException(
            field.name,
            `${field.name} must be a number`,
          )
        }
        parsed[field.name] = num
        break
      }
      case "boolean":
        if (typeof value !== "boolean") {
          throw validationException(
            field.name,
            `${field.name} must be a boolean`,
          )
        }
        parsed[field.name] = value
        break
      case "enum":
        if (typeof value !== "string" || !field.enumValues?.includes(value)) {
          throw validationException(
            field.name,
            `${field.name} must be one of ${(field.enumValues ?? []).join(", ")}`,
          )
        }
        parsed[field.name] = value
        break
      default: {
        const exhaustive: never = field.type
        throw new Error(`Unhandled connection config field type: ${exhaustive}`)
      }
    }
  }
  return parsed
}

export const resolveAdapter = (
  provider: IntegrationType,
): ConnectionAdapter => {
  const adapter = CONNECTION_REGISTRY[provider]
  if (!adapter) {
    throw connectionNotConfiguredException(provider)
  }
  return adapter
}

export const findOrThrow = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const connection = await connectionRepository.findByIdForWorkspace({
    id: input.connectionId,
    workspaceId: input.workspaceId,
  })
  if (!connection) {
    throw notFoundException("Connection not found")
  }
  return connection
}

/**
 * Best-effort `provider.webhook.subscribe` right after a fresh
 * `connect.completed` — the FSM design's own "webhook.subscribe
 * best-effort (failure → degraded, lastError)" edge (`state.ts`'s
 * `verify.failed_non_auth`), mirrored from `disconnect`'s existing
 * best-effort `webhook.unsubscribe` call. Never throws: a subscribe
 * failure degrades the just-created connection instead of failing the
 * whole connect (the row and quota consumption already committed).
 */
export const subscribeWebhookBestEffort = async (input: {
  adapter: ConnectionAdapter
  auth: AuthValue
  connection: ConnectionModel
  ownerId: string | undefined
}): Promise<ConnectionModel> => {
  if (!input.adapter.provider.webhook) {
    return input.connection
  }
  try {
    await input.adapter.provider.webhook.subscribe({ auth: input.auth })
    return input.connection
  } catch (err) {
    logger.warn(
      {
        err,
        connectionId: input.connection.id,
        provider: input.connection.provider,
      },
      "connect: webhook subscribe failed, marking connection degraded",
    )
    try {
      return await connectionStateService.transition({
        connectionId: input.connection.id,
        event: "verify.failed_non_auth",
        reason: "verify_failed",
        ownerId: input.ownerId,
      })
    } catch (transitionErr) {
      // This call runs after `upsertConnectionRow` commits the connection as
      // `connected`. A transition failure must not make `connectTargets`
      // release the target or report failure after that durable success.
      // Degradation is best-effort; return the committed connection unchanged.
      // A later health check can still degrade an unhealthy webhook.
      logger.error(
        {
          err: transitionErr,
          connectionId: input.connection.id,
          provider: input.connection.provider,
        },
        "connect: failed to mark connection degraded after a webhook subscribe failure; leaving it connected",
      )
      return input.connection
    }
  }
}

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
 * Revive-or-insert-then-transition: the ~90-line block `connectFromCredentials`
 * and `connectCandidate` each ran independently before this extraction.
 *
 * Attempts to update an existing satellite row in place first whenever
 * `existing` still carries a foreign key (`resolveForeignKey`), and falls
 * back to inserting a fresh satellite row when that update actually
 * matches zero rows. The fallback matters because `Connection.inboxId`/
 * `integrationId` is NEVER cleared when a `delete_row` provider's
 * satellite row is deleted on disconnect (only the row itself goes away)
 * — so the stored FK being present does NOT mean a row to update still
 * exists; it's equally consistent with "this connection was fully
 * disconnected a while ago". Deciding from the FK's mere presence alone
 * (the previous `store.onDisconnect === "keep_row"` check had the same
 * flaw) silently no-ops the `UPDATE` and proceeds as if the auth were
 * saved, which under-reported as two different regressions:
 * - (I2) a `delete_row` provider's `connectFromCredentials({ allowUpdate:
 *   true })` call against an already-CONNECTED row (e.g. `PUT
 *   /v1/integrations/ai/{provider}` rotating an API key — the satellite
 *   row is still there, never deleted) used to always fall to the insert
 *   branch, which either collided with the satellite table's own unique
 *   constraint (a spurious `connectionAlreadyConnected` 409 for claude/
 *   deepseek/gemini/openrouter) or — for openai, which has none — silently
 *   inserted a SECOND `Integration` row and orphaned the first.
 * - (I3) reconnecting a `delete_row` channel (messenger/instagram) whose
 *   satellite row IS already gone used to always take the update branch
 *   (the FK/`inboxId` is still set), silently no-op, and still proceed to
 *   `connect.completed` — consuming quota and reporting success with no
 *   auth actually persisted anywhere.
 *
 * Either way this then updates or inserts the `Connection` row and drives
 * it through `connect.completed` — the sole event
 * `ConnectionStateService.transition` consumes quota from, so this is
 * inserted `disconnected` and transitioned, never hardcoded `connected`.
 */
export const saveOrInsertSatellite = async (input: {
  tx: DatabaseClient
  workspaceId: string
  inboxId?: string | null
  auth: AuthValue
  descriptor: ConnectionDescriptor
  extraConfig: Record<string, unknown>
  existing?: ConnectionModel
  store: NonNullable<ConnectionAdapter["store"]>
}): Promise<string | undefined> => {
  const existingForeignKey = input.existing
    ? resolveForeignKey(input.existing)
    : null
  if (
    existingForeignKey &&
    (await input.store.saveAuthByForeignKey(
      existingForeignKey,
      input.auth,
      input.extraConfig,
      input.tx,
    ))
  ) {
    return input.existing?.integrationId ?? undefined
  }

  try {
    const inserted = await input.store.insertRow(
      {
        workspaceId: input.workspaceId,
        inboxId: input.inboxId ?? undefined,
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

export const upsertConnectionRow = async (input: {
  tx: DatabaseClient
  workspaceId: string
  provider: IntegrationType
  kind: ConnectionKind
  descriptor: ConnectionDescriptor
  auth: AuthValue
  extraConfig: Record<string, unknown>
  existing: ConnectionModel | undefined
  store: NonNullable<ConnectionAdapter["store"]>
  ownerId: string | undefined
  quotaConsumption: {
    consumed: boolean
    workspaceId?: string
    workspaceUsageIncremented: boolean
  }
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
          inboxId: inboxId ?? existing.inboxId,
          integrationId: integrationId ?? null,
          displayName: descriptor.displayName,
          lastError: null,
          statusReason: null,
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
        sourceId: descriptor.sourceId,
        displayName: descriptor.displayName,
        inboxId: inboxId ?? null,
        integrationId: integrationId ?? null,
        status: "disconnected",
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
