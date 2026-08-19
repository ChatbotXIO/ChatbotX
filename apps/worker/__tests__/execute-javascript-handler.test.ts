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
  interpolateIntoJavascript: vi.fn(async (code: string) => code),
  executeAndMap: vi.fn(async () => ({ value: null })),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: mocks.getAll },
  getSystemFieldValue: mocks.getSystemFieldValue,
  interpolateIntoJavascript: mocks.interpolateIntoJavascript,
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
  mocks.interpolateIntoJavascript.mockImplementation(
    async (code: string) => code,
  )
  mocks.executeAndMap.mockResolvedValue({ value: null })
})

describe("handleExecuteJavascript", () => {
  test("substitutes step.code through interpolateIntoJavascript before sending it to the sandbox", async () => {
    const substitutedCode = 'return "MÁ CHÁN ".toLowerCase();'
    mocks.interpolateIntoJavascript.mockResolvedValue(substitutedCode)

    const props = createProps()
    await handleExecuteJavascript(props)

    expect(mocks.interpolateIntoJavascript).toHaveBeenCalledWith(
      props.step.code,
      expect.objectContaining({ contact: expect.anything() }),
    )
    expect(mocks.executeAndMap).toHaveBeenCalledTimes(1)
    const call = mocks.executeAndMap.mock.calls[0]?.[0] as {
      code: string
      input: Record<string, unknown>
    }
    // The sandbox receives the substituted code, not the raw step.code.
    expect(call.code).toBe(substitutedCode)
  })

  test("passes the contact/system-field variables through to interpolateIntoJavascript for substitution", async () => {
    // The deep escaping/injection guarantees (a malicious display name
    // can't break out of its string literal, type-aware literals, quote
    // classification, etc.) are unit-tested against the real
    // interpolateIntoJavascript in packages/variables/__tests__. This test
    // only pins that the handler wires step.code and the loaded variables
    // through to it — replacing the old assertion that step.code reached
    // the sandbox byte-identical, which this feature intentionally changes.
    const maliciousFirstName = 'x"; return "pwned'
    mocks.getSystemFieldValue.mockImplementation(async (_context, key) =>
      key === "first_name" ? maliciousFirstName : null,
    )
    mocks.interpolateIntoJavascript.mockResolvedValue(
      'return "x\\"; return \\"pwned";',
    )

    const props = createProps()
    props.step.code = 'return "{{first_name}}";'
    await handleExecuteJavascript(props)

    expect(mocks.interpolateIntoJavascript).toHaveBeenCalledWith(
      props.step.code,
      expect.objectContaining({ contact: expect.anything() }),
    )
    const call = mocks.executeAndMap.mock.calls[0]?.[0] as { code: string }
    expect(call.code).toBe('return "x\\"; return \\"pwned";')
    expect(call.code).not.toContain('return "pwned')
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

  test("passes a space-containing custom field name and the raw step code through to interpolateIntoJavascript", async () => {
    // The actual resolution of a space-containing name (the reported bug)
    // is covered end-to-end against the real implementation in
    // packages/variables/__tests__/interpolate-into-javascript.test.ts and
    // packages/variables/__tests__/contact-variable.test.ts. Here we only
    // pin that the handler forwards the custom field map it loaded.
    const customFieldsMap = new Map([
      [
        "fullname upper",
        {
          key: "fullname upper",
          type: "shortText" as const,
          value: "MÁ CHÁN",
          description: "",
        },
      ],
    ])
    mocks.getAll.mockResolvedValue({
      contact: { id: "contact-1", email: "a@example.com" },
      contactInbox: null,
      conversation: null,
      customFieldsMap,
      workspace: null,
    })
    mocks.interpolateIntoJavascript.mockResolvedValue(
      'return "MÁ CHÁN ".toLowerCase();',
    )

    const props = createProps()
    props.step.code = 'return "{{fullname upper}} ".toLowerCase();'
    await handleExecuteJavascript(props)

    expect(mocks.interpolateIntoJavascript).toHaveBeenCalledWith(
      props.step.code,
      expect.objectContaining({ customFieldsMap }),
    )
    const call = mocks.executeAndMap.mock.calls[0]?.[0] as { code: string }
    expect(call.code).toBe('return "MÁ CHÁN ".toLowerCase();')
  })
})
