import { os } from "@orpc/server"
import { analyticsBroadcastRoutes } from "./broadcast"
import { analyticsContactRoutes } from "./contact"
import { analyticsConversationRoutes } from "./conversation"
import { analyticsMessageRoutes } from "./message"
import { analyticsSequenceRoutes } from "./sequence"

export const analyticsRoutes = os.router({
  ...analyticsBroadcastRoutes,
  ...analyticsContactRoutes,
  ...analyticsConversationRoutes,
  ...analyticsMessageRoutes,
  ...analyticsSequenceRoutes,
})
