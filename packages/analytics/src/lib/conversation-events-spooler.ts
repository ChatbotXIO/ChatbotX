import {
  CONVERSATION_EVENTS_EVENT_TYPE,
  getAnalyticsConfig,
} from "./events-config"
import { createSpoolerHelpers } from "./ndjson-spooler-registry"

const conversationSpooler = createSpoolerHelpers(
  getAnalyticsConfig(CONVERSATION_EVENTS_EVENT_TYPE).eventType,
)

export const initConversationSpooler = conversationSpooler.init
export const getConversationSpooler = conversationSpooler.get
export const stopConversationSpooler = conversationSpooler.stop
