import { normalizeError } from "universal-error-normalizer"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
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
}

export function createDisconnectAction(
  service: DisconnectService,
  options: CreateDisconnectActionOptions,
) {
  const { name, log = true, afterDisconnect } = options

  return workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdrequestParams)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
      }) => {
        try {
          await service.disconnect(workspaceId)
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
