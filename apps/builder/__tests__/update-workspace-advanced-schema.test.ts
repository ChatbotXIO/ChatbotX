import { describe, expect, test } from "vitest"
import {
  SMART_RESPONSE_DELAY_NONE_VALUE,
  updateWorkspaceAdvancedRequest,
} from "../src/features/workspaces/schema/update-workspace-schema"

const baseInput = {
  defaultReply: "",
  targetCountry: "VN",
  language: "vi",
  timezone: "Asia/Ho_Chi_Minh",
  brandColor: "#123abc",
  developmentMode: false,
}

describe("updateWorkspaceAdvancedRequest.smartResponseDelaySeconds", () => {
  test("transforms a valid delay string into a number", () => {
    const result = updateWorkspaceAdvancedRequest.parse({
      ...baseInput,
      smartResponseDelaySeconds: "3",
    })

    expect(result.smartResponseDelaySeconds).toBe(3)
  })

  test("transforms the none value into null", () => {
    const result = updateWorkspaceAdvancedRequest.parse({
      ...baseInput,
      smartResponseDelaySeconds: SMART_RESPONSE_DELAY_NONE_VALUE,
    })

    expect(result.smartResponseDelaySeconds).toBeNull()
  })

  test("accepts its own output when parsed twice (client resolver then server inputSchema)", () => {
    const clientParsed = updateWorkspaceAdvancedRequest.parse({
      ...baseInput,
      smartResponseDelaySeconds: "3",
    })

    const serverParsed = updateWorkspaceAdvancedRequest.parse(clientParsed)

    expect(serverParsed.smartResponseDelaySeconds).toBe(3)
  })

  test("accepts null when parsed twice", () => {
    const clientParsed = updateWorkspaceAdvancedRequest.parse({
      ...baseInput,
      smartResponseDelaySeconds: SMART_RESPONSE_DELAY_NONE_VALUE,
    })

    const serverParsed = updateWorkspaceAdvancedRequest.parse(clientParsed)

    expect(serverParsed.smartResponseDelaySeconds).toBeNull()
  })

  test("rejects a delay outside the allowed options", () => {
    const result = updateWorkspaceAdvancedRequest.safeParse({
      ...baseInput,
      smartResponseDelaySeconds: "7",
    })

    expect(result.success).toBe(false)
  })

  test("rejects a numeric delay outside the allowed options", () => {
    const result = updateWorkspaceAdvancedRequest.safeParse({
      ...baseInput,
      smartResponseDelaySeconds: 7,
    })

    expect(result.success).toBe(false)
  })
})
