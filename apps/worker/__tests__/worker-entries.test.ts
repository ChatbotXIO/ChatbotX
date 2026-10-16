import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const SRC = join(import.meta.dirname, "../src")
const WORKER_FILE = /^worker(-[a-z]+)?\.ts$/

const workerEntries = (): string[] =>
  readdirSync(SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(SRC, dir.name))
        .filter((file) => WORKER_FILE.test(file))
        .map((file) => `src/${dir.name}/${file}`),
    )

describe("worker processes", () => {
  // The docker entrypoint only discovers what tsdown built; an entry that is
  // missing here is a worker that silently never starts in production.
  test("every worker module is a tsdown entry", () => {
    const config = readFileSync(
      join(import.meta.dirname, "../tsdown.config.ts"),
      "utf8",
    )
    const missing = workerEntries().filter(
      (entry) => !config.includes(`"${entry}"`),
    )
    expect(missing).toEqual([])
  })

  test("every worker module has a dev script, so `pnpm dev` starts it", () => {
    const scripts = JSON.parse(
      readFileSync(join(import.meta.dirname, "../package.json"), "utf8"),
    ).scripts as Record<string, string>
    const missing = workerEntries().filter(
      (entry) =>
        !Object.values(scripts).some((script) => script.includes(entry)),
    )
    expect(missing).toEqual([])
  })
})
