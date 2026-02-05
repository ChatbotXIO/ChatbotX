import {
  BOT_MESSAGE_EVENTS_EVENT_TYPE,
  getAnalyticsConfig,
} from "./events-config"
import { createSpoolerHelpers } from "./ndjson-spooler-registry"

const botMessageSpooler = createSpoolerHelpers(
  getAnalyticsConfig(BOT_MESSAGE_EVENTS_EVENT_TYPE).eventType,
)

export const initBotMessageSpooler = botMessageSpooler.init
export const getBotMessageSpooler = botMessageSpooler.get
export const stopBotMessageSpooler = botMessageSpooler.stop
