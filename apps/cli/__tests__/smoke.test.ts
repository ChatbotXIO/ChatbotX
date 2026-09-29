import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const executableDirective = /^#!\/usr\/bin\/env node\n/

test("build artifact starts with the Node executable directive", () => {
  const entrypoint = new URL("../dist/index.cjs", import.meta.url)

  expect(readFileSync(entrypoint, "utf8")).toMatch(executableDirective)
})
