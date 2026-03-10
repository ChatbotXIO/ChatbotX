export * from "./lib/bootstrap"
export * from "./lib/bot-message-events-spooler"
export * from "./lib/contact-events-spooler"
export * from "./lib/conversation-events-spooler"
export * from "./lib/ndjson-spooler-registry"
export * from "./lib/spooler-helper"

import { bootstrapAnalytics } from "./lib/bootstrap"
import { writeToSpooler } from "./lib/spooler-helper"
import { BaseService } from "./services/base.service"

export function setupAnalyticsServer() {
  BaseService.registerBootstrap(() => bootstrapAnalytics())
  BaseService.registerSpoolerWriter(writeToSpooler)
}
