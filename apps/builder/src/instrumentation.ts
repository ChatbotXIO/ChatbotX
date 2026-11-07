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

  // Next.js also compiles this file for the Edge runtime and traces every
  // import outside this guard into that bundle. The builder has no Edge
  // routes, so all server code loads here (AGENTS.md invariant 25).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertLicenseAtStartup } = await import(
      "@chatbotx.io/business/license-startup"
    )
    const { bootstrapPlatformAdminAtStartup } = await import(
      "@chatbotx.io/business/platform-admin/startup"
    )
    await assertLicenseAtStartup()
    await bootstrapPlatformAdminAtStartup()

    await import("./lib/orpc/orpc.server")
  }
}
