import {
  channelTypes,
  connectionKinds,
  connectionStatuses,
  connectionStatusReasons,
  connectSessionErrorCodes,
  connectSessionNextActionSchema,
  connectSessionOutcomeSchema,
  connectSessionPurposes,
  connectSessionStatuses,
  connectSessionTargetSchema,
  integrationTypes,
} from "@chatbotx.io/database/partials"
import type { ConnectionStrategy } from "@chatbotx.io/sdk"
import { z } from "zod"

/** Single source for the `strategy` enum shared by `connectionResource` and `connectionProviderResource` — kept in lockstep with the SDK's `ConnectionStrategy` via `satisfies`. */
const connectionStrategies = z.enum([
  "oauth_redirect",
  "oauth_popup",
  "token",
  "api_key",
  "self_serve",
]) satisfies z.ZodType<ConnectionStrategy>

/**
 * Public/private `Connection` DTO — explicit field list, **never** `auth`.
 * `capabilities` is joined from `CONNECTION_REGISTRY` at response time (see
 * `lib/resolve-provider.ts`), not stored on the row.
 */
export const connectionResource = z.object({
  id: z.string(),
  kind: connectionKinds,
  provider: integrationTypes,
  channel: channelTypes.nullable(),
  status: connectionStatuses,
  statusReason: connectionStatusReasons.nullable(),
  sourceId: z.string(),
  displayName: z.string(),
  inboxId: z.string().nullable(),
  integrationId: z.string().nullable(),
  strategy: connectionStrategies,
  capabilities: z.object({
    refreshable: z.boolean(),
    verifiable: z.boolean(),
    multiAccount: z.boolean(),
  }),
  authExpiresAt: z.string().nullable(),
  lastError: z.string().nullable(),
  connectedAt: z.string().nullable(),
  disconnectedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ConnectionResource = z.infer<typeof connectionResource>

const connectionProviderConfigField = z.object({
  name: z.string(),
  type: z.enum(["string", "secret", "number", "boolean", "enum", "url"]),
  required: z.boolean(),
  label: z.string(),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
})

export const connectionProviderResource = z.object({
  provider: integrationTypes,
  kind: connectionKinds,
  channel: channelTypes.nullable(),
  strategy: connectionStrategies,
  multiAccount: z.boolean(),
  configFields: z.array(connectionProviderConfigField),
  available: z.boolean(),
  unavailableReason: z
    .enum([
      "notImplemented",
      "hiddenForTenant",
      "alreadyConnected",
      "credentialMissing",
    ])
    .nullable(),
})
export type ConnectionProviderResource = z.infer<
  typeof connectionProviderResource
>

/** `ConnectSession` DTO — `GET /v1/connect-sessions/{id}` and the connect envelope's `session` field. Never `encryptedAuth`/`claimedTargetIds`/`stateNonceHash`. */
export const connectSessionResource = z.object({
  id: z.string(),
  provider: integrationTypes,
  purpose: connectSessionPurposes,
  status: connectSessionStatuses,
  // Provider-defined step name (`authorize`, `select`, `verify_code`, `done`,
  // …) — genuinely open-ended per `ConnectSession.step`'s own schema
  // comment, not a fixed enum like the fields above; `z.string()` here is
  // intentional, not an oversight.
  step: z.string(),
  nextAction: connectSessionNextActionSchema.nullable(),
  targets: z.array(connectSessionTargetSchema),
  connectionIds: z.array(z.string()),
  errorCode: connectSessionErrorCodes.nullable(),
  expiresAt: z.string(),
})
export type ConnectSessionResource = z.infer<typeof connectSessionResource>

/** `POST /v1/connections` and `POST /v1/connections/{id}/reconnect` response envelope: exactly one of `connection`/`session` is non-null. */
export const connectEnvelope = z.object({
  connection: connectionResource.nullable(),
  session: connectSessionResource.nullable(),
})

export const connectSessionTargetsResource = z.object({
  session: connectSessionResource,
  connections: z.array(connectionResource),
  /** `POST /v1/connect-sessions/{id}/targets` response's per-target outcome. */
  outcomes: z.array(connectSessionOutcomeSchema),
})
