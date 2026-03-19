// import { analyticsContactRoutes } from "./contact"

import { os } from "@orpc/server"
import { analyticsContactRoutes } from "./contact"
import { analyticsConversationRoutes } from "./conversation"
import { analyticsMessageRoutes } from "./message"

export const analyticsRoutes = os.router({
  ...analyticsContactRoutes,
  ...analyticsMessageRoutes,
  ...analyticsConversationRoutes,
})
