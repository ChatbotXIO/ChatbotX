#!/usr/bin/env node
// Cross-platform build entrypoint for the builder.
//
// Caps the Node heap so `next build` can't OOM a low-RAM machine (14GB dev box
// or CI) even when heavy apps (IDE, Docker, Discord) are running. Without a cap,
// `next build` can claim 8GB+ and get killed / freeze the whole machine via swap
// thrash. This is the permanent, baked-in version of the old manual:
//   NODE_OPTIONS="--max-old-space-size=4096" nice -n 19 taskset -c 0-3 ...
// (the nice/taskset part is a Linux nicety; the heap cap is the fix that matters
// and it works on Windows too).
//
// Heap override: NEXT_BUILD_HEAP (e.g. "6144"). Runs through dotenv so local
// `.env` vars load exactly like the old inline script did.
import { spawn } from "node:child_process"

const heap = process.env.NEXT_BUILD_HEAP ?? "4096"
process.env.NODE_OPTIONS = `--max-old-space-size=${heap}`
process.env.SKIP_ENV_CHECK = "true"

console.log(
  `[build-builder] next build con heap ${heap}MB (NODE_OPTIONS=${process.env.NODE_OPTIONS})`,
)

const child = spawn(
  "pnpm",
  ["exec", "dotenv", "-e", "../../.env", "--", "next", "build"],
  { stdio: "inherit", shell: true, env: process.env },
)

child.on("error", (err) => {
  console.error("[build-builder] no se pudo iniciar:", err)
  process.exit(1)
})
child.on("exit", (code) => process.exit(code ?? 1))
