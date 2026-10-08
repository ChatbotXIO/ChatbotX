import { workspaceService } from "@chatbotx.io/business"
import type {
  SelfServeConnectActor,
  SelfServeSecret,
} from "@chatbotx.io/business/connection"
import { connectionWrongStrategyException } from "@chatbotx.io/business/errors"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { resolveAdapter } from "./internal"

export const connectSelfServeChannel = async (input: {
  workspaceId: string
  provider: IntegrationType
  config: Record<string, unknown>
  actor: SelfServeConnectActor
}): Promise<{
  connection: ConnectionModel
  secret: SelfServeSecret | null
}> => {
  const adapter = resolveAdapter(input.provider)
  if (adapter.provider.strategy !== "self_serve" || !adapter.connect) {
    throw connectionWrongStrategyException(input.provider)
  }

  const workspace = await workspaceService.findOrFail({
    where: { id: input.workspaceId },
  })
  const { connection, secret } = await adapter.connect({
    workspaceId: input.workspaceId,
    ownerId: workspace.ownerId,
    actor: input.actor,
    config: input.config,
  })

  return { connection, secret: secret ?? null }
}
