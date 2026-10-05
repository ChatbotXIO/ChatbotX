import { decisionConnectionService } from "@chatbotx.io/business"

export const listDecisionConnections = async (workspaceId: string) =>
  await decisionConnectionService.listSafe(workspaceId)
