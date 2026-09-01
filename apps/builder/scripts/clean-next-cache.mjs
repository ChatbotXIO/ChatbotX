#!/usr/bin/env node
// Removes Next.js persistent caches that balloon to many GB over time on a
// long-lived dev machine:
//   - .next/cache        -> webpack build cache (leftover from older `next build`)
//   - .next/dev/cache    -> Turbopack persistent dev cache
// Safe for both `dev` and `start`: build OUTPUT (.next/server, .next/static,
// routes, etc.) is intentionally NOT touched, so `next start` still serves a
// valid build. Cross-platform (Node fs, not `rm -rf`).
import { rm } from "node:fs/promises"
import { resolve } from "node:path"

const nextDir = resolve(import.meta.dirname, "..", ".next")
const targets = [
  ["cache"],
  ["dev", "cache"],
].map((parts) => resolve(nextDir, ...parts))

let removed = 0
for (const dir of targets) {
  try {
    await rm(dir, { recursive: true, force: true })
    removed++
    console.log(`[clean-next-cache] removed ${dir.replace(process.cwd(), ".")}`)
  } catch (err) {
    console.warn(`[clean-next-cache] skip ${dir}: ${err.message}`)
  }
}
if (removed === 0) {
  console.log("[clean-next-cache] nothing to clean")
}
