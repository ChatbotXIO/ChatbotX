// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { describe, expect, test } from "vitest"
import { commonApiErrors } from "@/lib/orpc/orpc-error-helper"

// A `ChatbotXException` thrown without a code carries `systemError` / 400, and
// the oRPC layer forwards that code unchanged. It must be a declared common
// code, otherwise every such rejection is served as `defined: false`.
describe("default ChatbotXException code", () => {
  test("is declared once for every public route with its real status", () => {
    const error = new ChatbotXException("Broadcast is not a draft")

    expect(error.code).toBe("systemError")
    expect(commonApiErrors).toHaveProperty(error.code)
    expect(commonApiErrors.systemError.status).toBe(error.httpStatusCode)
  })
})
