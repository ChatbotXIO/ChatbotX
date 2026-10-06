import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type { AuthValue } from "@chatbotx.io/sdk"
import { logger } from "../logger"
import { authExpiresAtOf } from "./auth-expiry"
import {
  InvalidConnectionTransitionException,
  isActiveConnectionStatus,
} from "./state"
import { connectionStateService } from "./state-service"

/** Mirrors refreshed satellite auth onto its active Connection row. */
export const recordRefreshedAuth = async (input: {
  workspaceId: string
  provider: IntegrationType
  sourceId: string
  auth: AuthValue
  tx?: DatabaseClient
}): Promise<void> => {
  const connection = await connectionRepository.findByProviderSourceId(
    {
      workspaceId: input.workspaceId,
      provider: input.provider,
      sourceId: input.sourceId,
    },
    input.tx,
  )
  if (!connection) {
    return
  }
  if (!isActiveConnectionStatus(connection.status)) {
    return
  }

  try {
    await connectionStateService.recordAuthSaved({
      connectionId: connection.id,
      authExpiresAt: authExpiresAtOf(input.auth),
      tx: input.tx,
    })
  } catch (err) {
    if (err instanceof InvalidConnectionTransitionException) {
      logger.warn(
        { err, connectionId: connection.id },
        "recordRefreshedAuth could not transition an inactive connection; auth was still saved",
      )
      return
    }
    throw err
  }
}
