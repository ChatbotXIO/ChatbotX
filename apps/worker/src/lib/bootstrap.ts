import {
  bootstrapAnalytics,
  setupAnalyticsServer,
} from "@chatbotx.io/analytics/server"

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
