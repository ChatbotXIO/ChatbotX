import {
  completeAuthorization,
  listAndAttachCandidates,
  startSession,
} from "./connect-session-flow"
import { connectTargets } from "./connect-targets"
import { connectFromCredentials, reconnect } from "./credentials"
import { attachIntegrationConnectionRow } from "./internal"
import { disconnect, refresh, verify } from "./lifecycle"
import { connectSelfServeChannel } from "./self-serve"

/**
 * Registry-aware orchestration over the `Connection` domain: provider-side
 * connect/disconnect/verify/refresh, `ConnectSession`-based OAuth flows, and
 * credential-strategy connects. Split across sibling modules to stay under
 * the project's 800-line cap per file:
 *
 * - `internal.ts` — shared private helpers (`resolveAdapter`, `findOrThrow`,
 *   `connectAndPersist`, `subscribeWebhookBestEffort`) plus `parseConfig`/
 *   `encryptedCandidatesSchema`. `resolveOwnerId`/`resolveForeignKey`/
 *   `saveOrInsertSatellite`/`withQuotaCompensation`/`toChannelType`/
 *   `upsertConnectionRow` live in `@chatbotx.io/business/connection` and are
 *   imported directly from there by every sibling module below.
 * - `lifecycle.ts` — `disconnect`/`refresh`/`verify`.
 * - `credentials.ts` — `connectFromCredentials`/`reconnect`.
 * - `self-serve.ts` — `connectSelfServeChannel`.
 * - `connect-session-flow.ts` — `startSession`/`completeAuthorization`/
 *   `listAndAttachCandidates` plus the private `completeReconnect` helper.
 * - `connect-targets.ts` — `connectTargets` plus its private
 *   `connectCandidate`/`failSession`/`toFailureOutcome` helpers.
 *
 * This object is the one public surface (`connectionService`) every caller
 * imports; the split above is purely a file-organization concern.
 */
export const connectionService = {
  disconnect,
  refresh,
  verify,
  connectFromCredentials,
  reconnect,
  connectSelfServeChannel,
  startSession,
  completeAuthorization,
  listAndAttachCandidates,
  connectTargets,
  attachIntegrationConnectionRow,
}
