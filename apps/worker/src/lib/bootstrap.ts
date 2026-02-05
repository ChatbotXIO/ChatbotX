import { bootstrapAnalytics } from "@aha.chat/analytics"

export async function bootstrapApp() {
  await bootstrapAnalytics()
}

let bootstrapPromise: Promise<void> | null = null

export async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapApp()
  }

  await bootstrapPromise
}
