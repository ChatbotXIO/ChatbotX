// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import manifest from "./api-parity-manifest.json"

/**
 * API-first guard. Every UI server action (`features/<feature>/actions/*.ts`)
 * must be classified in `api-parity-manifest.json` as either
 *   `covered:<feature>` — the feature has a public workspace-token surface, or
 *   `private:<reason>`  — deliberately UI-only, with the reason.
 * A new action that is not in the manifest fails here, so a UI capability can
 * no longer ship without a conscious API decision. Never leave an entry
 * undecided: pick `covered:` once the public route exists, or `private:`.
 */
const TS_EXTENSION = /\.ts$/
const CLASSIFICATION = /^(covered|private):\S.*/
const FEATURES_DIR = join(import.meta.dirname, "../src/features")
const ACTION_EXPORT = /^export (?:const|async function|function) (\w+)\b/gm

const listActions = (): string[] => {
  const keys: string[] = []
  for (const feature of readdirSync(FEATURES_DIR)) {
    const dir = join(FEATURES_DIR, feature, "actions")
    let files: string[]
    try {
      files = readdirSync(dir).filter(
        (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
      )
    } catch {
      continue
    }
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8")
      for (const match of source.matchAll(ACTION_EXPORT)) {
        keys.push(`${feature}/${file.replace(TS_EXTENSION, "")}:${match[1]}`)
      }
    }
  }
  return keys.sort()
}

const entries = manifest.operations as Record<string, string>

describe("api parity manifest", () => {
  test("every UI action is classified", () => {
    const undecided = listActions().filter((key) => !(key in entries))
    expect(undecided).toEqual([])
  })

  test("no entry is stale", () => {
    const actual = new Set(listActions())
    expect(Object.keys(entries).filter((key) => !actual.has(key))).toEqual([])
  })

  test("every entry is covered:<feature> or private:<reason>", () => {
    const invalid = Object.entries(entries).filter(
      ([, value]) => !CLASSIFICATION.test(value),
    )
    expect(invalid).toEqual([])
  })

  test("a covered feature really has a public router", () => {
    const features = new Set(
      Object.values(entries)
        .filter((v) => v.startsWith("covered:"))
        .map((v) => v.slice("covered:".length)),
    )
    const missing = [...features].filter((feature) => {
      try {
        readFileSync(join(FEATURES_DIR, feature, "api/public.ts"))
        return false
      } catch {
        try {
          return (
            readdirSync(join(FEATURES_DIR, feature, "api/public")).length === 0
          )
        } catch {
          return true
        }
      }
    })
    expect(missing).toEqual([])
  })
})
