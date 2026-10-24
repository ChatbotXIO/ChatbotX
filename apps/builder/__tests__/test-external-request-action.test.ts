// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { testExternalRequestAction } from "../src/features/flows/actions/test-external-request-action"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  externalRequestService: { execute: executeMock },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  externalRequestFieldsSchema: {},
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: {},
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `translated:${key}`,
}))

const action = testExternalRequestAction as unknown as ActionHandler

const runAction = () =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: {
      body: { bodyType: "json", jsonBody: '{"key":"value"}' },
      headers: [],
      method: "POST",
      url: "https://api.example.com/request",
    },
  })

describe("testExternalRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("maps an external request failure to a client-safe error", async () => {
    executeMock.mockRejectedValue(
      new TypeError("Request with GET/HEAD method cannot have body."),
    )

    await expect(runAction()).rejects.toMatchObject({
      code: "externalRequestFailed",
      httpStatusCode: 400,
      message: "translated:requestFailed",
    })
  })

  test("preserves expected client-safe external request errors", async () => {
    const error = new ChatbotXException("This URL is not allowed")
    executeMock.mockRejectedValue(error)

    await expect(runAction()).rejects.toBe(error)
  })
})
