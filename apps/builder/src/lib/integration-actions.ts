import { dispatchAuditRecordSafely } from "@chatbotx.io/business/audit"
import { connectionStateService } from "@chatbotx.io/business/connection"
import { connectionService } from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { normalizeError } from "universal-error-normalizer"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

interface DisconnectService {
  disconnect(workspaceId: string): Promise<void>
}

interface CreateDisconnectActionOptions {
  /** Optional side effect after a successful disconnect (e.g. AI cache invalidation). */
  afterDisconnect?: (workspaceId: string) => Promise<void>
  /** When true (default) failures are logged via `logger.error` then rethrown. */
  log?: boolean
  /** Human-readable integration name for the error log, e.g. "ActiveCampaign". */
  name: string
  /**
   * The `Connection` registry key for this integration — workspace-level
   * integrations are singletons (`sourceId = "workspace"`). When a
   * `Connection` row exists for `(workspaceId, provider, "workspace")` the
   * disconnect routes through `connectionService.disconnect` (provider-side
   * teardown + store-binding delete + FSM transition); otherwise (a
   * workspace predating the Phase 1 backfill) it falls back to `service`'s
   * own `disconnect`, so this never regresses a not-yet-backfilled
   * workspace's ability to disconnect.
   */
  provider: IntegrationType
}

/**
 * Scheduled for removal in Phase 5 of the connection-lifecycle plan, once
 * every adopter reads/writes the `Connection` domain directly instead of
 * going through a per-provider service. Until then this is the active,
 * correct implementation for the 13 workspace-integration disconnect
 * actions — it routes through `connectionService` itself (see `provider`
 * above), so adopters do not need any further change.
 */
export function createDisconnectAction(
  service: DisconnectService,
  options: CreateDisconnectActionOptions,
) {
  const { name, log = true, afterDisconnect, provider } = options

  return workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
      }) => {
        try {
          const connection =
            await connectionStateService.findByProviderSourceId({
              workspaceId,
              provider,
              sourceId: "workspace",
            })
          if (connection) {
            await connectionService.disconnect({
              connectionId: connection.id,
              workspaceId,
            })
            // The legacy `service.disconnect(workspaceId)` fallback below
            // already audits internally via `BaseService.audit()`;
            // `connectionService.disconnect` (the engine path) doesn't, so
            // this is the one place that has to — otherwise a backfilled
            // workspace's disconnect silently drops its audit trail.
            await dispatchAuditRecordSafely(
              {
                action: "disconnect",
                detail: `disconnected the ${name} integration (#${connection.id})`,
              },
              `Failed to audit ${name} disconnect`,
            )
          } else {
            await service.disconnect(workspaceId)
          }
        } catch (error) {
          if (log) {
            logger.error(
              { err: normalizeError(error), workspaceId },
              `Failed to disconnect ${name}`,
            )
          }
          throw error
        }
        // Isolated from the disconnect's own try/catch above: a post-
        // teardown side effect (e.g. AI cache invalidation) failing must
        // never report an already-successful disconnect as failed.
        try {
          await afterDisconnect?.(workspaceId)
        } catch (error) {
          logger.error(
            { err: normalizeError(error), workspaceId },
            `${name} disconnected, but its afterDisconnect hook failed`,
          )
        }
      },
    )
}
