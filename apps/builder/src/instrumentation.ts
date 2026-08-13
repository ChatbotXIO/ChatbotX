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

  // instrumentation also runs in the edge runtime, where process.exit doesn't
  // exist — only gate on the license in the nodejs runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertLicenseAtStartup } = await import(
      "@chatbotx.io/business/license-startup"
    )
    await assertLicenseAtStartup()
  }

  await import("./lib/orpc/orpc.server")
}
