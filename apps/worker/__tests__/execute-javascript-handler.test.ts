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
  resolveJavascriptInput: vi.fn(
    async () => new Map<string, string | number | boolean | null>(),
  ),
  interpolateIntoJavascript: vi.fn((code: string) => code),
  executeAndMap: vi.fn(async () => ({ value: null })),
}))

// Mirrors packages/variables/src/javascript-interpolation.ts's real
// implementation exactly (a pure number/boolean coercion, no DB
// dependency), since `@chatbotx.io/variables`'s barrel can't be imported
// actual here without resurrecting the Snowflake-collision problem
// documented at the bottom of this file.
const coerceCustomFieldValueForJavascript = (
  value: string,
  type: string,
): string | number | boolean | null => {
  if (type === "number") {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }
  if (type === "boolean") {
    return value === "true"
  }
  return value
}

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: mocks.getAll },
  getSystemFieldValue: mocks.getSystemFieldValue,
  resolveJavascriptInput: mocks.resolveJavascriptInput,
  interpolateIntoJavascript: mocks.interpolateIntoJavascript,
  coerceCustomFieldValueForJavascript,
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
  mocks.resolveJavascriptInput.mockResolvedValue(new Map())
  mocks.interpolateIntoJavascript.mockImplementation((code: string) => code)
  mocks.executeAndMap.mockResolvedValue({ value: null })
})

describe("handleExecuteJavascript", () => {
  test("rewrites step.code through interpolateIntoJavascript before sending it to the sandbox", async () => {
    const knownNames = new Map([["fullname upper", "MÁ CHÁN"]])
    const rewrittenCode =
      'return ("" + input["fullname upper"] + " ").toLowerCase();'
    mocks.resolveJavascriptInput.mockResolvedValue(knownNames)
    mocks.interpolateIntoJavascript.mockReturnValue(rewrittenCode)

    const props = createProps()
    await handleExecuteJavascript(props)

    expect(mocks.resolveJavascriptInput).toHaveBeenCalledWith(
      props.step.code,
      expect.objectContaining({ contact: expect.anything() }),
    )
    expect(mocks.interpolateIntoJavascript).toHaveBeenCalledWith(
      props.step.code,
      new Set(knownNames.keys()),
    )
    expect(mocks.executeAndMap).toHaveBeenCalledTimes(1)
    const call = mocks.executeAndMap.mock.calls[0]?.[0] as {
      code: string
      input: Record<string, unknown>
    }
    // The sandbox receives the rewritten code, not the raw step.code.
    expect(call.code).toBe(rewrittenCode)
  })

  test("merges every resolved {{...}} name into the input object alongside the existing custom/system fields", async () => {
    // resolveJavascriptInput's results (e.g. a coupon: value, which isn't
    // already in `input` from the customFieldsMap/systemFieldTypes loops
    // above it) must reach the sandbox's `input` object, since
    // interpolateIntoJavascript's rewritten code reads them via
    // input["name"], never as a spliced literal.
    mocks.resolveJavascriptInput.mockResolvedValue(
      new Map([["coupon:123", "SAVE10"]]),
    )
    mocks.interpolateIntoJavascript.mockReturnValue(
      'return input["coupon:123"];',
    )

    const props = createProps()
    props.step.code = "return {{coupon:123}};"
    await handleExecuteJavascript(props)

    const call = mocks.executeAndMap.mock.calls[0]?.[0] as {
      input: Record<string, unknown>
    }
    expect(call.input["coupon:123"]).toBe("SAVE10")
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

  test("routes an output type mismatch to the error result with its actionable message", async () => {
    // executeAndMap throws a ChatbotXException (which extends Error) when
    // the sandbox's result doesn't fit the output field's declared type —
    // this proves that failure reaches the step's error branch instead of
    // being swallowed or reported as a generic success.
    mocks.executeAndMap.mockRejectedValue(
      new Error(
        'JavaScript returned "Abcd 123", which is not a valid number value for the output field "Age".',
      ),
    )

    await expect(handleExecuteJavascript(createProps())).resolves.toEqual({
      status: "error",
      errorMessage:
        'JavaScript returned "Abcd 123", which is not a valid number value for the output field "Age".',
      result: null,
    })
  })

  test("coerces every custom field seeded into input, not only ones referenced via {{...}}", async () => {
    // A field read directly as input.age (never as {{age}}) must still be
    // typed consistently with one read via {{age}} — both come from the
    // same customFieldsMap, so both must go through the same coercion.
    mocks.getAll.mockResolvedValue({
      contact: { id: "contact-1", email: "a@example.com" },
      contactInbox: null,
      conversation: null,
      customFieldsMap: new Map([
        ["age", { key: "age", type: "number", value: "30", description: "" }],
        [
          "is_vip",
          { key: "is_vip", type: "boolean", value: "true", description: "" },
        ],
      ]),
      workspace: null,
    })

    const props = createProps()
    props.step.code = "return input.age + 1"
    await handleExecuteJavascript(props)

    const call = mocks.executeAndMap.mock.calls[0]?.[0] as {
      input: Record<string, unknown>
    }
    expect(call.input.age).toBe(30)
    expect(call.input.is_vip).toBe(true)
  })
})

// The suite above mocks @chatbotx.io/variables entirely, so it only pins the
// WIRING between the handler and resolveJavascriptInput/
// interpolateIntoJavascript — not their actual placement/injection
// behavior. An unmocked, `vi.importActual` end-to-end test was tried here
// and dropped: @chatbotx.io/variables's barrel (its only export path — see
// package.json) re-exports contact-variable.ts, which pulls in
// @chatbotx.io/database and re-initializes a module-singleton Snowflake ID
// generator, colliding with the one this test file's own transitive imports
// already initialized ("Place ID 0 already in use"). Reproducing the
// @chatbotx.io/business/* submodule mocks needed to import utils.ts in
// isolation would duplicate the setup already in
// packages/variables/__tests__/interpolate-into-javascript.test.ts, which is
// exactly where that coverage belongs (see AGENTS.md's test-placement
// guidance) — including the precedence case (`"{{fullname upper}} "
// .toLowerCase()` with value "MÁ CHÁN" executing to "má chán ") and the
// injection-is-structurally-impossible regression suite.
