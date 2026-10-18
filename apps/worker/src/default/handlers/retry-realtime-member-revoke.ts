import { retryWorkspaceMemberRealtimeConnections } from "@chatbotx.io/business"
import type { JobRetryRealtimeMemberRevoke } from "@chatbotx.io/worker-config"

export const retryRealtimeMemberRevoke = async (
  data: JobRetryRealtimeMemberRevoke["data"],
): Promise<void> => {
  await retryWorkspaceMemberRealtimeConnections(data)
}
