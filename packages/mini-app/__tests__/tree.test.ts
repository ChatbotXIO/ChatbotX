// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import { sanitizeMiniAppAnswers } from "../src/answers"
import {
  collectAllNames,
  createNode,
  createScreen,
  createStarterDefinition,
  duplicateNode,
  findNode,
  insertNode,
  moveNode,
  removeNode,
  removeScreen,
  toAlphabeticIndex,
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

  it("clears navigate actions pointing to a removed screen", () => {
    const definition = removeScreen(twoScreenDefinition(), "s_confirm")
    expect(definition.screens).toHaveLength(1)
    expect(
      findNode(definition, "n_next")?.node.props["on-click-action"],
    ).toBeUndefined()
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
