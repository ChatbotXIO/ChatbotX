import {
  bootstrapAnalytics,
  setupAnalyticsServer,
} from "@aha.chat/analytics/server"

export async function bootstrapApp() {
  setupAnalyticsServer()
  await bootstrapAnalytics()
}
let bootstrapPromise: Promise<void> | null = null

export async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapApp()
  }

  await bootstrapPromise
}
