import {
  connectionKinds,
  connectionStatuses,
  connectSessionNextActionSchema,
  connectSessionOutcomeSchema,
  connectSessionPurposes,
  connectSessionStatuses,
  connectSessionTargetSchema,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * Public/private `Connection` DTO — explicit field list, **never** `auth`.
 * `capabilities` is joined from `CONNECTION_REGISTRY` at response time (see
 * `lib/resolve-provider.ts`), not stored on the row.
 */
export const connectionResource = z.object({
  id: z.string(),
  kind: connectionKinds,
  provider: z.string(),
  channel: z.string().nullable(),
  status: connectionStatuses,
  statusReason: z.string().nullable(),
  sourceId: z.string(),
  displayName: z.string(),
  inboxId: z.string().nullable(),
  integrationId: z.string().nullable(),
  strategy: z.enum([
    "oauth_redirect",
    "oauth_popup",
    "token",
    "api_key",
    "self_serve",
  ]),
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

export const connectionProviderConfigField = z.object({
  name: z.string(),
  type: z.enum(["string", "secret", "number", "boolean", "enum", "url"]),
  required: z.boolean(),
  label: z.string(),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
})

export const connectionProviderResource = z.object({
  provider: z.string(),
  kind: connectionKinds,
  channel: z.string().nullable(),
  strategy: z.enum([
    "oauth_redirect",
    "oauth_popup",
    "token",
    "api_key",
    "self_serve",
  ]),
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
  provider: z.string(),
  purpose: connectSessionPurposes,
  status: connectSessionStatuses,
  step: z.string(),
  nextAction: connectSessionNextActionSchema.nullable(),
  targets: z.array(connectSessionTargetSchema),
  connectionIds: z.array(z.string()),
  errorCode: z.string().nullable(),
  expiresAt: z.string(),
})
export type ConnectSessionResource = z.infer<typeof connectSessionResource>

/** `POST /v1/connections` and `POST /v1/connections/{id}/reconnect` response envelope: exactly one of `connection`/`session` is non-null. */
export const connectEnvelope = z.object({
  connection: connectionResource.nullable(),
  session: connectSessionResource.nullable(),
})
export type ConnectEnvelope = z.infer<typeof connectEnvelope>

/** `POST /v1/connect-sessions/{id}/targets` response. */
export const connectSessionOutcomeResource = connectSessionOutcomeSchema

export const connectSessionTargetsResource = z.object({
  session: connectSessionResource,
  connections: z.array(connectionResource),
  outcomes: z.array(connectSessionOutcomeResource),
})
