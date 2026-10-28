import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { decode, encode } from "@jridgewell/sourcemap-codec"
import { describe, expect, test } from "vitest"

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/prune-sourcemaps.mjs",
)

const withTemporaryDirectory = (
  callback: (directory: string) => void,
): void => {
  const directory = mkdtempSync(join(tmpdir(), "prune-sourcemaps-"))
  try {
    callback(directory)
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

describe("prune-sourcemaps", () => {
  test("keeps first-party mappings, collapses third-party runs, and drops source content", () => {
    withTemporaryDirectory((directory) => {
      const sourceMapPath = join(directory, "worker.mjs.map")
      const mappings = encode([
        [
          [0, 0, 0, 0],
          [10, 1, 0, 0],
          [15, 1, 0, 5],
          [20, 2, 0, 0],
        ],
      ])
      writeFileSync(
        sourceMapPath,
        JSON.stringify({
          version: 3,
          sources: [
            "apps/worker/src/worker.ts",
            "node_modules/bullmq/dist/index.js",
            "packages/business/src/service.ts",
          ],
          sourcesContent: ["first", "third", "second"],
          names: [],
          mappings,
        }),
      )

      execFileSync(process.execPath, [SCRIPT, directory])

      const pruned = JSON.parse(readFileSync(sourceMapPath, "utf8"))
      expect(decode(pruned.mappings)).toEqual([
        [[0, 0, 0, 0], [10], [20, 2, 0, 0]],
      ])
      expect(pruned).not.toHaveProperty("sourcesContent")
    })
  })

  test("fails when the directory contains no source maps", () => {
    withTemporaryDirectory((directory) => {
      const result = spawnSync(process.execPath, [SCRIPT, directory])

      expect(result.status).toBe(1)
      expect(result.stderr.toString()).toContain("no .map files found")
    })
  })

  test("rejects the removed copy-to mode", () => {
    withTemporaryDirectory((directory) => {
      const copyTarget = join(directory, "copy-target")
      mkdirSync(copyTarget)

      const result = spawnSync(process.execPath, [
        SCRIPT,
        directory,
        "--copy-to",
        copyTarget,
      ])

      expect(result.status).toBe(1)
      expect(result.stderr.toString()).toContain(
        "Usage: prune-sourcemaps.mjs <dir>",
      )
    })
  })
})
