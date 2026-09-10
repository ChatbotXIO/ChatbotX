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
  // exist and Node built-ins aren't bundleable. Everything below is nodejs-only:
  // the license check calls process.exit, and the oRPC server router pulls in a
  // Node-only tree (crypto, redis, bullmq, the DB client) that only ever backs
  // SSR/RSC in the nodejs runtime. Importing it under edge drags `crypto` into
  // the Edge Runtime and tries to compile worker-only packages there — so gate
  // the whole block on the nodejs runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const { assertLicenseAtStartup } = await import(
    "@chatbotx.io/business/license-startup"
  )
  await assertLicenseAtStartup()

  await import("./lib/orpc/orpc.server")
}
