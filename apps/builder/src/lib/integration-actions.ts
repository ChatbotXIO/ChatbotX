import { connectionService } from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
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
          const connection = await connectionRepository.findByProviderSourceId({
            workspaceId,
            provider,
            sourceId: "workspace",
          })
          if (connection) {
            await connectionService.disconnect({
              connectionId: connection.id,
              workspaceId,
            })
          } else {
            await service.disconnect(workspaceId)
          }
          await afterDisconnect?.(workspaceId)
        } catch (error) {
          if (log) {
            logger.error(
              { err: normalizeError(error), workspaceId },
              `Failed to disconnect ${name}`,
            )
          }
          throw error
        }
      },
    )
}
