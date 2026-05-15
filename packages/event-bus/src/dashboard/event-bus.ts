import {
  type AnalyticsDashboardEvent,
  type AnalyticsDashboardEventMap,
  analyticsDashboardEventSchemas,
  type BaseEventListener,
} from "@chatbotx.io/flow-config"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"

const MAX_DASHBOARD_EVENTS = 500_000

export const dashboardEventBus = new BaseEventBus<
  AnalyticsDashboardEventMap,
  BaseEventListener<AnalyticsDashboardEvent>
>(getRedisConnection(), {
  streamKey: "events:analytics-dashboard",
  consumerGroup: "analytics-dashboard-events-group",
  maxLen: MAX_DASHBOARD_EVENTS,
  schemas: analyticsDashboardEventSchemas,
})
