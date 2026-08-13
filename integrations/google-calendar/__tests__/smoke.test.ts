import { describe, expect, it } from "vitest"
import { integration } from "../src"

describe("google-calendar integration", () => {
  it("exports the integration definition", () => {
    expect(integration.name).toBe("googleCalendar")
  })
})
