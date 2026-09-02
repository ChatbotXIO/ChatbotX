import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const NUQS_ROOT_IMPORT_PATTERN = /from "nuqs"\s*$/m

// This guards a production-breaking regression (C1): `nuqs`'s root entry
// (`dist/index.js`) starts with `'use client'`, so importing from `"nuqs"`
// inside `search-parsers.ts` — which is evaluated in the React Server
// Component graph via `page.tsx` -> `schema/query.ts` -> this file —
// resolves to a client-reference proxy and throws at request time.
// `nuqs/server` exports the same parser objects without the directive and
// is safe to import from both server and client modules, so this file must
// always import from `"nuqs/server"`, never the root `"nuqs"` entry.
// The RSC boundary itself cannot be exercised inside vitest's node
// environment (there is no server/client module graph to violate), so this
// test asserts the import source statically instead.
describe("search-parsers.ts stays RSC-safe", () => {
  test('imports shared parsers from "nuqs/server", not "nuqs"', () => {
    const filePath = join(
      import.meta.dirname,
      "../src/features/broadcasts/schema/search-parsers.ts",
    )
    const source = readFileSync(filePath, "utf8")

    expect(source).toContain('from "nuqs/server"')
    expect(source).not.toMatch(NUQS_ROOT_IMPORT_PATTERN)
    expect(source).not.toContain('from "nuqs"')
  })
})
