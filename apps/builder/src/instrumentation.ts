import { PHASE_PRODUCTION_BUILD } from "next/constants"

let realtimeDrainRegistered = false

export async function register() {
  // Next.js runs `register()` when it boots a server instance — including the
  // throwaway instance spun up during `next build`. Skipping that phase keeps
  // build from importing the oRPC server (and its transitive cache/DB clients),
  // so no Redis/Postgres connection is attempted against a host that isn't there
  // at build time.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return
  }

  // instrumentation also runs in the edge runtime, where process.exit doesn't
  // exist — only gate on the license in the nodejs runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertLicenseAtStartup } = await import(
      "@chatbotx.io/business/license-startup"
    )
    await assertLicenseAtStartup()

    if (!realtimeDrainRegistered) {
      realtimeDrainRegistered = true
      const [{ flushAllPendingWorkspaceRealtimeEvents }, { logger }] =
        await Promise.all([
          import("@chatbotx.io/business"),
          import("./lib/log"),
        ])
      const shutdown = async (): Promise<void> => {
        let exitCode = 0
        try {
          await flushAllPendingWorkspaceRealtimeEvents()
        } catch (err) {
          exitCode = 1
          logger.error(
            { err },
            "Failed to flush realtime events during builder shutdown",
          )
        }
        process.exit(exitCode)
      }
      process.once("SIGINT", shutdown)
      process.once("SIGTERM", shutdown)
    }
  }

  await import("./lib/orpc/orpc.server")
}
