// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * AC 3: no translation job exists for a conversation nobody opened and no API
 * caller asked about. Translation is requested only by `requestMessages` (the
 * Inbox action and `translation.requestMessages` both call it). A new
 * enqueue site, in particular one hanging off message receipt, would turn
 * every inbound message into a provider call, so it has to be a deliberate
 * change to this list.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../../../..")
const SOURCE_ROOTS = ["apps", "packages", "integrations"]
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "__tests__",
  ".turbo",
])
const SOURCE_FILE_RE = /\.(ts|tsx)$/

const ENQUEUE_MARKERS = [
  "getTranslateMessagesJobOptions(",
  "AIJobAction.translateMessages,",
]
const ALLOWED_ENQUEUE_FILES = new Set([
  "apps/builder/src/features/translation/lib/request-messages.ts",
])

const collectSourceFiles = (dir: string, found: string[]): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) {
      continue
    }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(path, found)
    } else if (
      SOURCE_FILE_RE.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      found.push(path)
    }
  }
  return found
}

describe("translation jobs", () => {
  test("are enqueued from one place, never from message receipt", () => {
    const enqueueSites: string[] = []
    for (const root of SOURCE_ROOTS) {
      for (const workspace of readdirSync(join(REPO_ROOT, root))) {
        const src = join(REPO_ROOT, root, workspace, "src")
        let files: string[]
        try {
          files = collectSourceFiles(src, [])
        } catch {
          continue
        }
        for (const file of files) {
          // The job definition and the worker that consumes it are not enqueue sites.
          const repoPath = relative(REPO_ROOT, file)
          if (
            repoPath.startsWith("packages/worker-config/") ||
            repoPath.startsWith("apps/worker/")
          ) {
            continue
          }
          const text = readFileSync(file, "utf8")
          if (ENQUEUE_MARKERS.some((marker) => text.includes(marker))) {
            enqueueSites.push(repoPath)
          }
        }
      }
    }

    expect(enqueueSites.sort()).toEqual([...ALLOWED_ENQUEUE_FILES].sort())
  })

  test("the worker never enqueues one either", () => {
    const workerFiles = collectSourceFiles(
      join(REPO_ROOT, "apps/worker/src"),
      [],
    )
    const offenders = workerFiles
      .filter((file) => !file.endsWith("ai-agent/worker.ts"))
      .filter((file) =>
        readFileSync(file, "utf8").includes("getTranslateMessagesJobOptions("),
      )
      .map((file) => relative(REPO_ROOT, file))

    expect(offenders).toEqual([])
  })
})
