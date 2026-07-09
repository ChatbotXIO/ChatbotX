import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const TOOL_HANDLER_IMPORT_PATTERN =
  /import \{[^}]*externalRequest[^}]*\} from "\.\/tool-handler"/s

describe("External request worker step registration", () => {
  test("dispatches callApi steps to externalRequest", () => {
    const source = readFileSync("src/integration/handlers/step.ts", "utf8")
    expect(source).toMatch(TOOL_HANDLER_IMPORT_PATTERN)
    expect(source).toContain("[stepTypes.enum.callApi]: externalRequest")
  })
})
