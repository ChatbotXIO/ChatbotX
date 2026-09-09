import { os } from "@orpc/server"
import { analyticsBroadcastRoutes } from "./broadcast"
import { analyticsCommentAutomationRoutes } from "./comment-automation"
import { analyticsContactRoutes } from "./contact"
import { analyticsConversationRoutes } from "./conversation"
import { analyticsFlowRoutes } from "./flow"
import { analyticsMacRoutes } from "./mac"
import { analyticsMagicLinkRoutes } from "./magic-link"
import { analyticsMessageRoutes } from "./message"
import { analyticsReflinkRoutes } from "./reflink"
import { analyticsSequenceRoutes } from "./sequence"

export const analyticsRoutes = os.router({
  ...analyticsBroadcastRoutes,
  ...analyticsCommentAutomationRoutes,
  ...analyticsContactRoutes,
  ...analyticsConversationRoutes,
  ...analyticsMessageRoutes,
  ...analyticsSequenceRoutes,
  ...analyticsFlowRoutes,
  ...analyticsMacRoutes,
  ...analyticsReflinkRoutes,
  ...analyticsMagicLinkRoutes,
})
