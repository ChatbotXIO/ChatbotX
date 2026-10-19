import { describe, expect, test } from "vitest"
import {
  createWebchatRequest,
  updateWebchatRequest,
} from "../src/features/integration-webchat/schema/mutation"
import { updateWebchatPublicRequest } from "../src/features/integration-webchat/schema/public"

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

    // Every defaulted create field must stay absent so a PATCH never
    // clobbers stored values with defaults.
    expect(result).toEqual({ name: "Website chat" })
  })
})

test("does not add defaults to an empty public API PATCH", () => {
  expect(updateWebchatPublicRequest.parse({})).toEqual({})
})
