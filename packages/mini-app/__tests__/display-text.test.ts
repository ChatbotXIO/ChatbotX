import { describe, expect, it } from "vitest"
import {
  displayTexts,
  hasContactVariables,
  mapDisplayText,
  nodeHasContactVariables,
} from "../src/display-text"
import type { MiniAppDefinition } from "../src/types"
import { validateMiniApp } from "../src/validate"
import { twoScreenDefinition } from "./fixtures"

const withVariables = (): MiniAppDefinition => ({
  screens: [
    {
      key: "s1",
      id: "WELCOME",
      title: "Hi {{first_name}}",
      terminal: true,
      children: [
        {
          id: "t",
          type: "TextInput",
          props: { name: "phone", label: "SĐT {{first_name}}" },
        },
        {
          id: "d",
          type: "Dropdown",
          props: {
            name: "plan",
            label: "Plan",
            "data-source": [
              { id: "a", title: "Gói {{last_name}}", description: "x" },
            ],
          },
        },
        {
          id: "n",
          type: "NavigationList",
          props: {
            name: "nav",
            "list-items": [
              {
                id: "i",
                "main-content": { title: "Go {{city}}" },
                badge: "{{tier}}",
              },
            ],
          },
        },
        {
          id: "f",
          type: "Footer",
          props: { label: "Send", "on-click-action": { name: "complete" } },
        },
      ],
    },
  ],
})

describe("mapDisplayText", () => {
  it("visits screen titles, labels, options and navigation items but not keys", () => {
    const mapped = mapDisplayText(withVariables(), (text) =>
      text
        .replaceAll("{{first_name}}", "An")
        .replaceAll("{{last_name}}", "Le")
        .replaceAll("{{city}}", "HN")
        .replaceAll("{{tier}}", "VIP"),
    )
    const [screen] = mapped.screens
    expect(screen?.title).toBe("Hi An")
    expect(screen?.children[0]?.props).toMatchObject({
      name: "phone",
      label: "SĐT An",
    })
    expect(screen?.children[1]?.props["data-source"]).toEqual([
      { id: "a", title: "Gói Le", description: "x" },
    ])
    expect(screen?.children[2]?.props["list-items"]).toEqual([
      { id: "i", "main-content": { title: "Go HN" }, badge: "VIP" },
    ])
  })

  it("detects variables", () => {
    expect(hasContactVariables(withVariables())).toBe(true)
    expect(hasContactVariables(twoScreenDefinition())).toBe(false)
  })

  it("detects a variable in one node without touching it", () => {
    const definition = withVariables()
    const navigation = definition.screens[0]?.children[2]
    if (!navigation) {
      throw new Error("missing node")
    }
    const before = structuredClone(navigation)
    expect(nodeHasContactVariables(navigation)).toBe(true)
    expect(navigation).toEqual(before)
  })
})

describe("displayTexts", () => {
  it("marks only markdown texts as markdown", () => {
    const definition = withVariables()
    definition.screens[0]?.children.push(
      { id: "r", type: "RichText", props: { text: "rich" } },
      { id: "b", type: "TextBody", props: { text: "md", markdown: true } },
      { id: "p", type: "TextBody", props: { text: "plain" } },
    )
    const markdown = [...displayTexts(definition)]
      .filter((entry) => entry.context.markdown)
      .map((entry) => entry.text)
    expect(markdown).toEqual(["rich", "md"])
  })
})

describe("validation with variables", () => {
  it("checks the screen title length with a variable counted as one character", () => {
    const definition = withVariables()
    const screen = definition.screens[0]
    if (!screen) {
      throw new Error("missing screen")
    }
    const titleTooLong = () =>
      validateMiniApp(definition).issues.some(
        (issue) =>
          issue.property === "title" && issue.code === "property_too_long",
      )
    screen.title = `${"a".repeat(79)}{{first_name}}`
    expect(titleTooLong()).toBe(false)
    screen.title = "a".repeat(81)
    expect(titleTooLong()).toBe(true)
  })

  it("counts a variable as one character and warns that WhatsApp cannot show it", () => {
    const definition = withVariables()
    const input = definition.screens[0]?.children[0]
    if (input) {
      // 21 raw characters, but 7 once the variable counts as one: within the 20 limit.
      input.props.label = "Phone of {{first_name}}"
    }
    const issues = validateMiniApp(definition).issues
    expect(
      issues.filter((issue) => issue.code === "property_too_long"),
    ).toEqual([])
    expect(
      issues.some(
        (issue) =>
          issue.code === "contact_variable_whatsapp" &&
          issue.severity === "warning",
      ),
    ).toBe(true)
  })
})
