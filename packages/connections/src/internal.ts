import { inboxService } from "@chatbotx.io/business"
import { dispatchAuditRecordSafely } from "@chatbotx.io/business/audit"
import {
  type ConnectionAdapter,
  type ConnectionQuotaConsumption,
  connectionStateService,
  toChannelType,
  upsertConnectionRow,
  withQuotaCompensation,
} from "@chatbotx.io/business/connection"
import {
  connectionNotConfiguredException,
  notFoundException,
  validationException,
} from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import type {
  AuthValue,
  ConnectionCandidate,
  ConnectionConfigField,
  ConnectionDescriptor,
  ConnectionStrategy,
} from "@chatbotx.io/sdk"
import {
  authValueSchema,
  ConnectionProviderRejectedError,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { logger } from "./logger"
import { CONNECTION_REGISTRY } from "./registry"

/** Single source for which `ConnectionStrategy`s connect via direct credentials (vs. an OAuth round trip) — shared by `credentials.ts`'s strategy-branch check, `connect-flow.ts`'s `startConnect`, and `resolve-provider.ts`'s catalog availability check. */
export const isCredentialStrategy = (strategy: ConnectionStrategy): boolean =>
  strategy === "token" || strategy === "api_key" || strategy === "self_serve"

/**
 * What a session's `encryptedAuth` blob actually holds once
 * `completeAuthorization` lists candidates: the full `ConnectionCandidate[]`
 * (each with its own `auth`), not just the single exchanged `auth` — a
 * multi-account provider (Messenger) hands back one distinct per-page auth
 * per candidate. The shared `authValueSchema` validates the base auth shape
 * while preserving provider-defined `custom` fields.
 */
export const encryptedCandidatesSchema = z.array(
  z.object({
    sourceId: z.string(),
    displayName: z.string(),
    authExpiresAt: z.string().optional(),
    avatarUrl: z.string().optional(),
    alreadyConnected: z.enum(["this_workspace", "other_workspace"]).optional(),
    auth: authValueSchema,
  }),
) satisfies z.ZodType<ConnectionCandidate[]>

export const encryptedAuthorizationSchema =
  authValueSchema satisfies z.ZodType<AuthValue>

type ProviderFailure = {
  code?: unknown
  httpStatusCode?: unknown
  name?: unknown
  response?: { status?: unknown }
  status?: unknown
  statusCode?: unknown
}

const TRANSIENT_NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
])

/** Reads the HTTP status off whichever shape a provider SDK's thrown error uses. */
const extractHttpStatus = (failure: ProviderFailure): number | undefined => {
  if (typeof failure.response?.status === "number") {
    return failure.response.status
  }
  if (typeof failure.httpStatusCode === "number") {
    return failure.httpStatusCode
  }
  if (typeof failure.status === "number") {
    return failure.status
  }
  if (typeof failure.statusCode === "number") {
    return failure.statusCode
  }
  return
}

/** Converts known provider 4xx responses to the explicit rejection contract. */
export const toConnectionProviderError = (error: unknown): unknown => {
  if (error instanceof ConnectionProviderRejectedError) {
    return error
  }
  if (!error || typeof error !== "object") {
    return error
  }
  const status = extractHttpStatus(error as ProviderFailure)
  if (
    status === undefined ||
    status < 400 ||
    status >= 500 ||
    status === 408 ||
    status === 429
  ) {
    return error
  }
  const message =
    error instanceof Error
      ? error.message
      : "The provider rejected the request."
  return new ConnectionProviderRejectedError(message, error)
}

/**
 * Maps unknown, network, timeout, and upstream-5xx failures to retryable
 * gateway statuses. Only explicit provider rejection errors map to 400.
 */
export const providerFailureStatus = (
  error: unknown,
): 502 | 503 | undefined => {
  if (error instanceof ConnectionProviderRejectedError) {
    return
  }
  if (!error || typeof error !== "object") {
    return 502
  }
  const failure = error as ProviderFailure
  const status = extractHttpStatus(failure)
  if (status !== undefined) {
    if (status >= 500) {
      return 502
    }
    if (status === 408 || status === 429) {
      return 503
    }
  }
  if (
    failure.name === "AbortError" ||
    failure.name === "TimeoutError" ||
    (typeof failure.code === "string" &&
      TRANSIENT_NETWORK_ERROR_CODES.has(failure.code))
  ) {
    return 503
  }
  return 502
}

const parseConfigItem = (
  value: unknown,
  fieldName: string,
  item: NonNullable<ConnectionConfigField["items"]>,
): unknown => {
  switch (item.type) {
    case "string":
    case "secret":
    case "url":
      if (typeof value !== "string") {
        throw validationException(fieldName, `${fieldName} must be a string`)
      }
      return value
    case "number": {
      const numberValue = typeof value === "number" ? value : Number(value)
      if (Number.isNaN(numberValue)) {
        throw validationException(fieldName, `${fieldName} must be a number`)
      }
      return numberValue
    }
    case "boolean":
      if (typeof value !== "boolean") {
        throw validationException(fieldName, `${fieldName} must be a boolean`)
      }
      return value
    case "enum":
      if (typeof value !== "string" || !item.enumValues?.includes(value)) {
        throw validationException(
          fieldName,
          `${fieldName} must be one of ${(item.enumValues ?? []).join(", ")}`,
        )
      }
      return value
    case "object":
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw validationException(fieldName, `${fieldName} must be an object`)
      }
      return item.fields
        ? parseConfig(item.fields, value as Record<string, unknown>)
        : value
    default: {
      const exhaustive: never = item.type
      throw new Error(`Unhandled connection config item type: ${exhaustive}`)
    }
  }
}

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
      case "array": {
        if (!Array.isArray(value)) {
          throw validationException(
            field.name,
            `${field.name} must be an array`,
          )
        }
        const items = field.items
        parsed[field.name] = items
          ? value.map((item, index) =>
              parseConfigItem(item, `${field.name}[${index}]`, items),
            )
          : value
        break
      }
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
 * `connect.completed`. Runs AFTER `connectAndPersist`'s own transaction has
 * already committed, so a subscribe failure can never fail the connect
 * itself: it is tolerated by persisting `verify.failed_non_auth` (degrading
 * the connection). If that follow-up transition ALSO fails, this rethrows —
 * silently returning the stale (still `connected`-looking) row would hide a
 * connection that is neither subscribed nor marked degraded from every
 * caller and observability signal.
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
      logger.error(
        {
          err: transitionErr,
          connectionId: input.connection.id,
          provider: input.connection.provider,
        },
        "connect: failed to mark connection degraded after a webhook subscribe failure",
      )
      throw transitionErr
    }
  }
}

/**
 * Shared body of `connectFromCredentials`'s revive-or-insert transaction and
 * `connectCandidate`'s per-target connect: mints (or revives) the `Inbox`
 * row a channel-kind connection needs before `store.insertRow`/
 * `connectionStateService.transition`'s own Inbox mirror can run —
 * `skipQuota: true` there is required since `transition`'s quota edge is the
 * sole quota consumption point on this path, so also consuming inside
 * `inboxService.create` would charge a brand-new channel twice. Wraps the
 * whole thing in `withQuotaCompensation` so a mid-transaction failure
 * releases any quota unit `transition` already consumed, then subscribes
 * the provider webhook best-effort.
 */
export const connectAndPersist = async (input: {
  adapter: ConnectionAdapter
  provider: IntegrationType
  workspaceId: string
  auth: AuthValue
  descriptor: ConnectionDescriptor
  extraConfig: Record<string, unknown>
  existing: ConnectionModel | undefined
  ownerId: string | undefined
  actorUserId?: string | null
  /** Reuses an inactive channel's existing `inboxId` instead of minting a new one — only `connectFromCredentials`'s revive-or-insert path does this; a fresh `connectCandidate` target never has one yet. */
  reuseExistingInboxId?: boolean
  missingOwnerError: Error
}): Promise<ConnectionModel> => {
  const { adapter, auth, descriptor, extraConfig, existing, ownerId } = input
  const { provider } = adapter
  if (!adapter.store) {
    throw connectionNotConfiguredException(input.provider)
  }
  const store = adapter.store

  const quotaConsumption: ConnectionQuotaConsumption = {
    consumed: false,
    workspaceUsageIncremented: false,
  }
  const connection = await withQuotaCompensation(
    {
      ownerId,
      quotaConsumption,
      context: { provider: input.provider, workspaceId: input.workspaceId },
    },
    async () =>
      await db.transaction(async (tx) => {
        let inboxId = input.reuseExistingInboxId
          ? (existing?.inboxId ?? undefined)
          : undefined
        if (provider.kind === "channel" && !inboxId) {
          if (!ownerId) {
            throw input.missingOwnerError
          }
          const { inbox } = await inboxService.create({
            data: {
              workspaceId: input.workspaceId,
              channel: toChannelType(input.provider),
              sourceId: descriptor.sourceId,
              name: descriptor.displayName,
            },
            ownerId,
            tx,
            skipQuota: true,
          })
          inboxId = inbox.id
        }
        return await upsertConnectionRow({
          tx,
          workspaceId: input.workspaceId,
          provider: input.provider,
          kind: provider.kind,
          descriptor,
          auth,
          extraConfig,
          existing,
          store,
          ownerId,
          quotaConsumption,
          actorUserId: input.actorUserId,
          inboxId,
        })
      }),
  )

  const final = await subscribeWebhookBestEffort({
    adapter,
    auth,
    connection,
    ownerId,
  })

  // Restores the "connected a new channel" audit record for every provider
  // the engine connects. Also fires when reviving an inactive satellite row
  // in place (`existing` truthy) — the operator still took a deliberate
  // connect action and expects an audit entry, same as a brand-new row;
  // only `!input.actorUserId` skips it (not faked), e.g. a workspace-token-
  // driven public API connect.
  if (input.actorUserId) {
    await dispatchAuditRecordSafely(
      {
        userId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: "connect",
        detail: `connected a new ${provider.kind === "channel" ? toChannelType(input.provider) : input.provider} connection (#${final.id})`,
      },
      `audit dispatch failed after ${input.provider} connect`,
    )
  }

  return final
}

/**
 * Keeps a `Connection` row in sync with a workspace-singleton integration's
 * satellite row a caller already wrote this request (e.g. Facebook Ads'
 * `storeFacebookAdsConnection`, Google Calendar's
 * `appointmentExternalCalendarService.createGoogleFromOAuthCallback`) —
 * those own the IntegrationFacebookAds/IntegrationGoogleCalendar
 * insert-or-update decision themselves (keyed by workspaceId for Facebook
 * Ads, by workspaceId + providerCalendarId for Google Calendar's
 * multi-calendar support), so this deliberately does NOT go through
 * `upsertConnectionRow`: its generic `CONNECTION_STORE_BINDINGS`-driven
 * satellite insert has no way to know the row it would insert already
 * exists, and would either surface a false "already connected" error for
 * Facebook Ads (whose satellite table enforces one row per workspace) or
 * silently create an orphaned duplicate Integration/satellite pair for
 * Google Calendar (whose satellite has no workspace-level uniqueness). This
 * only attaches/refreshes the `Connection` projection against the
 * `integrationId` the satellite write above already settled on. Lives here
 * (not the app-layer callback route) so the one `db.transaction` it needs
 * stays inside the connections package, per the repo's data-access rule.
 */
export const attachIntegrationConnectionRow = async (input: {
  workspaceId: string
  provider: IntegrationType
  sourceId: string
  displayName: string
  integrationId: string
  ownerId: string | undefined
  actorUserId: string
}): Promise<void> => {
  await db.transaction(async (tx) => {
    const existing = await connectionRepository.findByProviderSourceId(
      {
        workspaceId: input.workspaceId,
        provider: input.provider,
        sourceId: input.sourceId,
      },
      tx,
    )

    if (existing) {
      await connectionRepository.update(
        {
          id: existing.id,
          workspaceId: existing.workspaceId,
          values: {
            integrationId: input.integrationId,
            displayName: input.displayName,
            lastError: null,
          },
        },
        tx,
      )
      await connectionStateService.transition({
        connectionId: existing.id,
        event: "connect.completed",
        ownerId: input.ownerId,
        tx,
      })
      return
    }

    const created = await connectionRepository.insert(
      {
        workspaceId: input.workspaceId,
        provider: input.provider,
        kind: "integration",
        channel: null,
        sourceId: input.sourceId,
        displayName: input.displayName,
        inboxId: null,
        integrationId: input.integrationId,
        status: "disconnected",
        statusReason: "manual",
        disconnectedAt: new Date(),
        createdBy: input.actorUserId,
      },
      tx,
    )
    await connectionStateService.transition({
      connectionId: created.id,
      event: "connect.completed",
      ownerId: input.ownerId,
      tx,
    })
  })
}
