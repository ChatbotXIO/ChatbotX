import { PHASE_PRODUCTION_BUILD } from "next/constants"

export async function register() {
  // Next.js runs `register()` when it boots a server instance — including the
  // throwaway instance spun up during `next build`. Skipping that phase keeps
  // build from importing the oRPC server (and its transitive cache/DB clients),
  // so no Redis/Postgres connection is attempted against a host that isn't there
  // at build time.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // This node-only module reaches the database, so it cannot be statically
    // traced into the Edge instrumentation bundle.
    const { assertLicenseAtStartup } = await import(
      "@chatbotx.io/business/license-startup"
    )
    const { bootstrapPlatformAdminAtStartup } = await import(
      "@chatbotx.io/business/platform-admin/startup"
    )
    const { initErrorTracking } = await import("@chatbotx.io/observability")
    initErrorTracking({ service: "builder" })
    await assertLicenseAtStartup()
    await bootstrapPlatformAdminAtStartup()
  }

  await import("./lib/orpc/orpc.server")
}
