import {
  completeAuthorization,
  connectTargets,
  listAndAttachCandidates,
  startSession,
} from "./connect-session-flow"
import { connectFromCredentials, reconnect } from "./credentials"
import { disconnect, refresh, verify } from "./lifecycle"

/**
 * Registry-aware orchestration over the `Connection` domain: provider-side
 * connect/disconnect/verify/refresh, `ConnectSession`-based OAuth flows, and
 * credential-strategy connects. Split across sibling modules to stay under
 * the project's 800-line cap per file:
 *
 *   - `internal.ts` — shared private helpers (`resolveAdapter`,
 *     `findOrThrow`, `resolveOwnerId`, `subscribeWebhookBestEffort`,
 *     `toChannelType`, `upsertConnectionRow`) plus `parseConfig`/
 *     `resolveForeignKey`/`encryptedCandidatesSchema`.
 *   - `lifecycle.ts` — `disconnect`/`refresh`/`verify`.
 *   - `credentials.ts` — `connectFromCredentials`/`reconnect`.
 *   - `connect-session-flow.ts` — `startSession`/`completeAuthorization`/
 *     `listAndAttachCandidates`/`connectTargets` plus the session-flow-only
 *     private helpers `completeReconnect`/`connectCandidate`.
 *
 * This class is the one public surface (`connectionService`) every caller
 * imports; the split above is purely a file-organization concern; behavior
 * is unchanged.
 */
class ConnectionService {
  disconnect = disconnect
  refresh = refresh
  verify = verify
  connectFromCredentials = connectFromCredentials
  reconnect = reconnect
  startSession = startSession
  completeAuthorization = completeAuthorization
  listAndAttachCandidates = listAndAttachCandidates
  connectTargets = connectTargets
}

export const connectionService = new ConnectionService()
