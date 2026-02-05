import { CONTACT_EVENTS_EVENT_TYPE, getAnalyticsConfig } from "./events-config"
import { createSpoolerHelpers } from "./ndjson-spooler-registry"

const contactSpooler = createSpoolerHelpers(
  getAnalyticsConfig(CONTACT_EVENTS_EVENT_TYPE).eventType,
)

export const initContactSpooler = contactSpooler.init
export const getContactSpooler = contactSpooler.get
export const stopContactSpooler = contactSpooler.stop
