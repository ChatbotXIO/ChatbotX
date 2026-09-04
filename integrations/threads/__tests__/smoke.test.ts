import { expect, test } from "vitest"
import { integration } from "../src"

test("threads integration smoke", () => {
  expect(integration.name).toBe("threads")
})
