import {
  connectSessionErrorCodes,
  connectSessionPurposes,
} from "@chatbotx.io/utils/connection"
import { z } from "zod"
import { credentialEncryptedSchema } from "./credential"
import type { IntegrationType } from "./integration"

/**
 * `Connection`'s enums are defined in `@chatbotx.io/utils/connection` (same
 * rationale as `channelTypes` in `./channel.ts`) so packages that cannot
 * depend on the database layer can still reference these values. Re-exported
 * here as the conventional database-layer import site.
 */
export {
  ACTIVE_CONNECT_SESSION_STATUSES,
  ACTIVE_CONNECTION_STATUSES,
  type ActiveConnectionStatus,
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  type ConnectionKind,
  type ConnectionStatus,
  type ConnectionStatusReason,
  type ConnectionStatusState,
  type ConnectSessionErrorCode,
  type ConnectSessionPurpose,
  type ConnectSessionStatus,
  connectionKinds,
  connectionStatuses,
  connectionStatusReasons,
  connectSessionErrorCodes,
  connectSessionPurposes,
  connectSessionStatuses,
  INACTIVE_CONNECTION_STATUSES,
  isProviderOffboardedConnection,
  PROVIDER_ACCOUNT_TARGET_BATCH_SIZE,
  type ProviderAccountEventDetail,
  type ProviderAccountEventKind,
  type ProviderAccountRouteScope,
  type ProviderAccountTarget,
  providerAccountEventKinds,
  TERMINAL_CONNECT_SESSION_STATUSES,
} from "@chatbotx.io/utils/connection"

/**
 * `User.connectionAuthorizations`: a backup of the user's latest provider
 * authorization, kept independently of `Connection` and channel rows. One entry
 * per provider; the stored auth is encrypted, bound to the user and provider
 * through {@link userConnectionAuthorizationAad}.
 */
export const connectionAuthorizationPhases = z.enum([
  // The OAuth exchange, SSO reuse or a callback produced an auth.
  "authorizationObtained",
  "candidateListingSucceeded",
  // Includes a listing that returned zero candidates.
  "candidateListingFailed",
  "reconnectValidated",
  // Token / api_key strategies.
  "credentialsValidated",
])
export type ConnectionAuthorizationPhase = z.infer<
  typeof connectionAuthorizationPhases
>

export const userConnectionAuthorizationSchema = z.object({
  // Same shape as `EncryptedData`. Not imported from `@chatbotx.io/encryption`:
  // that package validates env at import time, which would break the schema
  // loaders that run without it (drizzle-kit, the drift check).
  encryptedAuth: credentialEncryptedSchema,
  phase: connectionAuthorizationPhases,
  // Null for connect paths that do not run through a connect session.
  purpose: connectSessionPurposes.nullable(),
  // Null when the connect started without a workspace (first connect).
  workspaceId: z.string().nullable(),
  connectSessionId: z.string().nullable(),
  candidateCount: z.number().int().nullable(),
  unavailableCandidateCount: z.number().int().nullable(),
  connectSessionErrorCode: connectSessionErrorCodes.nullable(),
  // ISO-8601 instant; the repository's newer-wins guard compares it.
  capturedAt: z.string().datetime(),
})
export type UserConnectionAuthorization = z.infer<
  typeof userConnectionAuthorizationSchema
>

/** Keyed by provider (`IntegrationType`). */
export type UserConnectionAuthorizations = Partial<
  Record<IntegrationType, UserConnectionAuthorization>
>

/** The one AAD for both writing and reading an entry. */
export const userConnectionAuthorizationAad = (
  userId: string,
  provider: IntegrationType,
): string => `user:${userId}:connection-authorization:${provider}`
