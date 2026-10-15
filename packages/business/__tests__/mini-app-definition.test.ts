import { describe, expect, test, vi } from "vitest"

vi.mock("../src/errors", () => ({
  validationException: (field: string, message: string) =>
    Object.assign(new Error(message), { field }),
}))

const {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  createStarterDefinition,
  fromFlowJson,
  toFlowJson,
} = await import("@chatbotx.io/mini-app")
const { buildNewDefinition, buildUpdatedDefinition } = await import(
  "../src/mini-app/definition"
)

const flowJson = {
  version: "7.3",
  screens: [
    {
      id: "WELCOME",
      title: "Welcome",
      terminal: true,
      layout: {
        type: "SingleColumnLayout" as const,
        children: [
          { type: "TextInput", name: "full_name", label: "Full name" },
          { type: "TextInput", name: "email", label: "Email" },
          {
            type: "Footer",
            label: "Done",
            "on-click-action": { name: "complete", payload: {} },
          },
        ],
      },
    },
  ],
}

const mapped = (mappings: Record<string, string>) =>
  applyCustomFieldMappings(fromFlowJson(flowJson), mappings)

describe("buildNewDefinition", () => {
  test("imports Flow JSON and applies the given mappings", () => {
    const definition = buildNewDefinition({
      flowJson,
      customFieldMappings: { email: "9" },
    })
    expect(toFlowJson(definition).screens[0]?.id).toBe("WELCOME")
    expect(collectCustomFieldMappings(definition)).toEqual({ email: "9" })
  })

  test("stores an editor definition as is", () => {
    const starter = createStarterDefinition("Welcome")
    expect(buildNewDefinition({ definition: starter })).toEqual(starter)
  })

  test("rejects a write without screens", () => {
    expect(() => buildNewDefinition({})).toThrow(
      expect.objectContaining({ field: "definition" }),
    )
  })
})

describe("buildUpdatedDefinition", () => {
  test("changes nothing when no screens or mappings are given", () => {
    expect(buildUpdatedDefinition(mapped({}), {})).toBeUndefined()
  })

  test("a new Flow JSON keeps existing mappings by input name", () => {
    const definition = buildUpdatedDefinition(mapped({ full_name: "77" }), {
      flowJson,
      customFieldMappings: { email: "9" },
    })
    expect(definition && collectCustomFieldMappings(definition)).toEqual({
      full_name: "77",
      email: "9",
    })
  })

  test("mappings alone change the current screens; null removes one", () => {
    const definition = buildUpdatedDefinition(
      mapped({ full_name: "77", email: "9" }),
      { customFieldMappings: { full_name: null } },
    )
    expect(definition && collectCustomFieldMappings(definition)).toEqual({
      email: "9",
    })
  })

  test("an editor definition replaces the screens with its own mappings", () => {
    const editor = mapped({ email: "5" })
    const definition = buildUpdatedDefinition(mapped({ full_name: "77" }), {
      definition: editor,
    })
    expect(definition && collectCustomFieldMappings(definition)).toEqual({
      email: "5",
    })
  })
})
