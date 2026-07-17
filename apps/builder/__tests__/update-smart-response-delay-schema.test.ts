import { describe, expect, test } from "vitest"
import {
  SMART_RESPONSE_DELAY_NONE_VALUE,
  updateSmartResponseDelayRequest,
} from "../src/features/workspaces/schema/update-workspace-schema"

describe("updateSmartResponseDelayRequest.smartResponseDelaySeconds", () => {
  test("transforms a valid delay string into a number", () => {
    const result = updateSmartResponseDelayRequest.parse({
      smartResponseDelaySeconds: "3",
    })

    expect(result.smartResponseDelaySeconds).toBe(3)
  })

  test("transforms the none value into null", () => {
    const result = updateSmartResponseDelayRequest.parse({
      smartResponseDelaySeconds: SMART_RESPONSE_DELAY_NONE_VALUE,
    })

    expect(result.smartResponseDelaySeconds).toBeNull()
  })

  test("accepts its own output when parsed twice (client resolver then server inputSchema)", () => {
    const clientParsed = updateSmartResponseDelayRequest.parse({
      smartResponseDelaySeconds: "3",
    })

    const serverParsed = updateSmartResponseDelayRequest.parse(clientParsed)

    expect(serverParsed.smartResponseDelaySeconds).toBe(3)
  })

  test("accepts null when parsed twice", () => {
    const clientParsed = updateSmartResponseDelayRequest.parse({
      smartResponseDelaySeconds: SMART_RESPONSE_DELAY_NONE_VALUE,
    })

    const serverParsed = updateSmartResponseDelayRequest.parse(clientParsed)

    expect(serverParsed.smartResponseDelaySeconds).toBeNull()
  })

  test("rejects a delay outside the allowed options", () => {
    const result = updateSmartResponseDelayRequest.safeParse({
      smartResponseDelaySeconds: "7",
    })

    expect(result.success).toBe(false)
  })

  test("rejects a numeric delay outside the allowed options", () => {
    const result = updateSmartResponseDelayRequest.safeParse({
      smartResponseDelaySeconds: 7,
    })

    expect(result.success).toBe(false)
  })
})
