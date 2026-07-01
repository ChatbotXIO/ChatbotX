import {
  type AnalyticsDashboardEvent,
  type AnalyticsDashboardEventMap,
  analyticsDashboardEventSchemas,
  type BaseEventListener,
} from "@chatbotx.io/flow-config"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"

const MAX_DASHBOARD_EVENTS = 500_000
const MAX_DASHBOARD_DLQ_EVENTS = 100_000

export const dashboardEventBus = new BaseEventBus<
  AnalyticsDashboardEventMap,
  BaseEventListener<AnalyticsDashboardEvent>
>(getRedisConnection(), {
  streamKey: "events:analytics-dashboard",
  consumerGroup: "analytics-dashboard-events-group",
  deadLetterMaxLen: MAX_DASHBOARD_DLQ_EVENTS,
  deadLetterStreamKey: "events:analytics-dashboard:dead",
  enableSelectiveRetry: true,
  maxLen: MAX_DASHBOARD_EVENTS,
  maxDeliveries: 5,
  schemas: analyticsDashboardEventSchemas,
})
