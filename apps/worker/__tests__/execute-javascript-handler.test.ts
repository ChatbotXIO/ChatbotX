import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(async () => ({
    contact: { id: "contact-1", email: "a@example.com" },
    contactInbox: null,
    conversation: null,
    customFieldsMap: new Map(),
    workspace: null,
  })),
  getSystemFieldValue: vi.fn(async () => null as string | null),
  executeAndMap: vi.fn(async () => ({ value: null })),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: mocks.getAll },
  getSystemFieldValue: mocks.getSystemFieldValue,
}))

vi.mock("@chatbotx.io/business/javascript-execution", () => ({
  javascriptExecutionService: { executeAndMap: mocks.executeAndMap },
}))

const { handleExecuteJavascript } = await import(
  "../src/integration/handlers/tool-handler"
)

const createProps = () =>
  ({
    contactInbox: null,
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    step: {
      id: "step-1",
      stepType: "executeJavascript",
      code: "return input.first_name",
      customFieldId: "field-1",
      states: [],
    },
  }) as Parameters<typeof handleExecuteJavascript>[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAll.mockResolvedValue({
    contact: { id: "contact-1", email: "a@example.com" },
    contactInbox: null,
    conversation: null,
    customFieldsMap: new Map(),
    workspace: null,
  })
  mocks.getSystemFieldValue.mockResolvedValue(null)
  mocks.executeAndMap.mockResolvedValue({ value: null })
})

describe("handleExecuteJavascript", () => {
  test("passes step.code through unmodified and never interpolates contact data into it", async () => {
    // Simulates a visitor whose channel display name (a system field, e.g.
    // Messenger/WhatsApp/webchat profile name) is attacker-controlled.
    const maliciousFirstName = 'x"; return "pwned'
    mocks.getSystemFieldValue.mockImplementation(async (_context, key) =>
      key === "first_name" ? maliciousFirstName : null,
    )

    const props = createProps()
    await handleExecuteJavascript(props)

    expect(mocks.executeAndMap).toHaveBeenCalledTimes(1)
    const call = mocks.executeAndMap.mock.calls[0]?.[0] as {
      code: string
      input: Record<string, unknown>
    }

    // The code payload sent to the sandbox must be byte-identical to
    // step.code — no interpolation of contact-supplied data into source.
    expect(call.code).toBe(props.step.code)
    expect(call.code).not.toContain("pwned")

    // The malicious value only ever appears as inert data on `input`.
    expect(call.input.first_name).toBe(maliciousFirstName)
  })

  test("returns a success result on successful execution", async () => {
    await expect(handleExecuteJavascript(createProps())).resolves.toEqual({
      status: "success",
      result: null,
    })
  })

  test("returns an error result with the message when an Error is thrown", async () => {
    mocks.executeAndMap.mockRejectedValue(new Error("execution failed"))

    await expect(handleExecuteJavascript(createProps())).resolves.toEqual({
      status: "error",
      errorMessage: "execution failed",
      result: null,
    })
  })

  test("returns a generic error result when a non-Error value is thrown", async () => {
    mocks.executeAndMap.mockRejectedValue("some string failure")

    await expect(handleExecuteJavascript(createProps())).resolves.toEqual({
      status: "error",
      errorMessage: "JavaScript execution failed",
      result: null,
    })
  })
})
