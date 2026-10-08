import { describe, expect, test } from "vitest"
import {
  createWebchatRequest,
  updateWebchatRequest,
} from "../src/features/integration-webchat/schema/mutation"

describe("webchat mutation schemas", () => {
  test("applies create defaults when a minimal webchat is submitted", () => {
    const result = createWebchatRequest.parse({
      name: "Website chat",
      authorizedDomains: [],
    })

    expect(result.enable).toBe(true)
  })

  test("does not add create defaults to a partial update", () => {
    const result = updateWebchatRequest.parse({ name: "Website chat" })

    expect(result).not.toHaveProperty("enable")
  })
})
