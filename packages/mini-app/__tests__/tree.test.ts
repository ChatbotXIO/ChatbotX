// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import { sanitizeMiniAppAnswers } from "../src/answers"
import {
  appendScreen,
  collectAllNames,
  createNode,
  createScreen,
  createStarterDefinition,
  duplicateNode,
  findNode,
  getSlotOwnerType,
  insertNode,
  isTerminalScreen,
  moveNode,
  removeNode,
  removeScreen,
  screenActions,
  slotEntries,
  toAlphabeticIndex,
  updateNodeCustomField,
  updateNodeProps,
  updateNodeSlots,
} from "../src/tree"
import { validateMiniApp } from "../src/validate"
import { twoScreenDefinition } from "./fixtures"

describe("tree helpers", () => {
  it("names screens A–Z, then AA–ZZ, then AAA", () => {
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(toAlphabeticIndex)).toEqual(
      ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"],
    )
  })

  it("gives a new screen the first free letter id", () => {
    const definition = createStarterDefinition("Welcome")
    const first = createScreen(definition, "Next")
    expect(first.id).toBe("SCREEN_A")
    const withA = { screens: [...definition.screens, first] }
    expect(createScreen(withA, "Next").id).toBe("SCREEN_B")
  })

  it("creates screens whose ids pass validation", () => {
    let definition = createStarterDefinition("Welcome")
    for (let index = 0; index < 5; index++) {
      definition = {
        screens: [...definition.screens, createScreen(definition, "Next")],
      }
    }
    const ids = definition.screens.map((screen) => screen.id)
    expect(new Set(ids).size).toBe(ids.length)
    const screenIdIssues = validateMiniApp(definition).issues.filter((issue) =>
      issue.code.startsWith("screen_id"),
    )
    expect(screenIdIssues).toEqual([])
  })

  it("creates a valid starter app", () => {
    expect(validateMiniApp(createStarterDefinition("Welcome")).valid).toBe(true)
  })

  it("gives new inputs unique names", () => {
    const definition = twoScreenDefinition()
    const names = collectAllNames(definition)
    const first = createNode("TextInput", names)
    const second = createNode("TextInput", names)
    expect(first.props.name).not.toBe(second.props.name)
  })

  it("moves a node into a container slot and back", () => {
    const definition = insertNode(
      twoScreenDefinition(),
      { screenKey: "s_welcome" },
      1,
      {
        id: "n_form",
        type: "Form",
        props: { name: "form_1" },
        slots: { children: [] },
      },
    )
    const moved = moveNode(
      definition,
      "n_name",
      { screenKey: "s_welcome", parentId: "n_form", slot: "children" },
      0,
    )
    expect(findNode(moved, "n_name")?.address).toEqual({
      screenKey: "s_welcome",
      parentId: "n_form",
      slot: "children",
    })
    const back = moveNode(moved, "n_name", { screenKey: "s_welcome" }, 0)
    expect(back.screens[0]?.children[0]?.id).toBe("n_name")
  })

  it("adjusts the index when moving down within the same list", () => {
    const moved = moveNode(
      twoScreenDefinition(),
      "n_heading",
      { screenKey: "s_welcome" },
      2,
    )
    expect(moved.screens[0]?.children.map((node) => node.id)).toEqual([
      "n_name",
      "n_heading",
      "n_next",
    ])
  })

  it("refuses to move a container into its own descendant", () => {
    const definition = insertNode(
      twoScreenDefinition(),
      { screenKey: "s_welcome" },
      0,
      {
        id: "n_outer",
        type: "If",
        props: { condition: "true" },
        slots: {
          then: [
            {
              id: "n_inner",
              type: "Switch",
              props: { value: "${form.full_name}" },
              slots: { a: [] },
            },
          ],
          else: [],
        },
      },
    )
    const result = moveNode(
      definition,
      "n_outer",
      { screenKey: "s_welcome", parentId: "n_inner", slot: "a" },
      0,
    )
    expect(result).toBe(definition)
  })

  it("duplicates with fresh ids and names, and removes nodes", () => {
    const { definition, nodeId } = duplicateNode(
      twoScreenDefinition(),
      "n_name",
    )
    const copy = nodeId ? findNode(definition, nodeId)?.node : undefined
    expect(copy?.props.name).toBe("full_name_1")
    expect(findNode(removeNode(definition, "n_name"), "n_name")).toBeUndefined()
  })

  it("ends the flow on the new last screen when the last screen is removed", () => {
    const definition = removeScreen(twoScreenDefinition(), "s_confirm")
    expect(definition.screens).toHaveLength(1)
    expect(
      findNode(definition, "n_next")?.node.props["on-click-action"],
    ).toEqual({ name: "complete" })
  })

  it("clears NavigationList items that navigated to a removed screen", () => {
    const definition = twoScreenDefinition()
    definition.screens.push({
      key: "s_menu",
      id: "MENU",
      title: "Menu",
      children: [
        {
          id: "n_menu",
          type: "NavigationList",
          props: {
            name: "menu",
            "list-items": [
              {
                id: "back",
                "main-content": { title: "Back" },
                "on-click-action": { name: "navigate", next: "s_welcome" },
              },
              {
                id: "confirm",
                "main-content": { title: "Confirm" },
                "on-click-action": { name: "navigate", next: "s_confirm" },
              },
            ],
          },
        },
      ],
    })
    const items = findNode(removeScreen(definition, "s_confirm"), "n_menu")
      ?.node.props["list-items"] as Record<string, unknown>[]
    expect(items.map((item) => item["on-click-action"])).toEqual([
      { name: "navigate", next: "s_welcome" },
      undefined,
    ])
  })

  it("replaces a node's props and custom field without touching the input", () => {
    const definition = twoScreenDefinition()
    const withProps = updateNodeProps(definition, "n_name", { name: "x" })
    expect(findNode(withProps, "n_name")?.node.props).toEqual({ name: "x" })
    expect(findNode(definition, "n_name")?.node.props.name).toBe("full_name")
    expect(updateNodeProps(definition, "n_missing", {})).toBe(definition)

    const linked = updateNodeCustomField(definition, "n_name", "cf_1")
    expect(findNode(linked, "n_name")?.node.customFieldId).toBe("cf_1")
    const unlinked = updateNodeCustomField(linked, "n_name", null)
    expect(findNode(unlinked, "n_name")?.node.customFieldId).toBeUndefined()
    expect(updateNodeCustomField(definition, "n_missing", "cf_1")).toBe(
      definition,
    )
  })

  it("resolves the container type that owns a slot", () => {
    const definition = twoScreenDefinition()
    const form = createNode("Form", new Set())
    const withForm = insertNode(definition, { screenKey: "s_welcome" }, 0, form)
    expect(getSlotOwnerType(withForm, { screenKey: "s_welcome" })).toBe(
      "Screen",
    )
    expect(
      getSlotOwnerType(withForm, {
        screenKey: "s_welcome",
        parentId: form.id,
        slot: "children",
      }),
    ).toBe("Form")
    expect(
      getSlotOwnerType(withForm, { screenKey: "s_welcome", parentId: "nope" }),
    ).toBeUndefined()
  })

  it("moves the end of the flow to an appended screen", () => {
    const { definition, screenKey } = appendScreen(
      twoScreenDefinition(),
      "Thanks",
    )
    const [welcome, confirm, added] = definition.screens
    expect(added?.key).toBe(screenKey)
    expect(welcome && isTerminalScreen(welcome)).toBe(false)
    expect(confirm && isTerminalScreen(confirm)).toBe(false)
    expect(added && isTerminalScreen(added)).toBe(true)
    expect(
      confirm && screenActions(confirm).map((action) => action.name),
    ).toEqual(["navigate"])
  })

  it("keeps Switch cases in order after jsonb sorts their keys", () => {
    const takenNames = new Set<string>()
    let definition = twoScreenDefinition()
    const node = createNode("Switch", takenNames)
    definition = insertNode(definition, { screenKey: "s_welcome" }, 0, node)
    definition = updateNodeSlots(definition, node.id, [
      ["basic", []],
      ["pro", []],
      ["vip", []],
    ])
    const stored = findNode(definition, node.id)?.node
    // Postgres jsonb returns keys shortest first.
    const reloaded = stored && {
      ...stored,
      slots: { pro: [], vip: [], basic: [] },
    }
    expect(reloaded && slotEntries(reloaded).map(([key]) => key)).toEqual([
      "basic",
      "pro",
      "vip",
    ])
  })

  it("lists If branches as then, else without a stored order", () => {
    expect(
      slotEntries({
        id: "n_if",
        type: "If",
        props: {},
        slots: { else: [], then: [] },
      }).map(([key]) => key),
    ).toEqual(["then", "else"])
  })
})

describe("sanitizeMiniAppAnswers", () => {
  it("keeps known inputs with accepted values only", () => {
    expect(
      sanitizeMiniAppAnswers(twoScreenDefinition(), {
        full_name: "Ana",
        terms: true,
        injected: "x",
      }),
    ).toEqual({ full_name: "Ana", terms: true })
    expect(
      sanitizeMiniAppAnswers(twoScreenDefinition(), { full_name: { a: 1 } }),
    ).toEqual({})
    expect(
      sanitizeMiniAppAnswers(twoScreenDefinition(), "nope"),
    ).toBeUndefined()
  })
})
