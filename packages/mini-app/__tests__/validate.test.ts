// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import type { MiniAppDefinition } from "../src/types"
import { validateMiniApp } from "../src/validate"
import { twoScreenDefinition } from "./fixtures"

const codes = (definition: MiniAppDefinition) =>
  validateMiniApp(definition).issues.map((issue) => issue.code)

describe("validateMiniApp", () => {
  it("accepts a valid two-screen app", () => {
    expect(validateMiniApp(twoScreenDefinition())).toEqual({
      valid: true,
      issues: [],
    })
  })

  it("requires a screen that completes the flow", () => {
    const definition = twoScreenDefinition()
    const footer = definition.screens[1]?.children.at(-1)
    if (footer) {
      footer.props["on-click-action"] = undefined
    }
    expect(codes(definition)).toContain("no_terminal_screen")
  })

  it("enforces per-screen limits and Footer position", () => {
    const definition = twoScreenDefinition()
    const welcome = definition.screens[0]
    welcome?.children.push({
      id: "n_late",
      type: "TextBody",
      props: { text: "after footer" },
    })
    for (let index = 0; index < 3; index++) {
      welcome?.children.unshift({
        id: `n_link_${index}`,
        type: "EmbeddedLink",
        props: {
          text: "Link",
          "on-click-action": { name: "open_url", url: "https://example.com" },
        },
      })
    }
    const result = codes(definition)
    expect(result).toContain("footer_not_last")
    expect(result).toContain("component_limit")
  })

  it("reports property limits with the max length", () => {
    const definition = twoScreenDefinition()
    const input = definition.screens[0]?.children[1]
    if (input) {
      input.props.label = "This label is far too long for Meta"
    }
    const issue = validateMiniApp(definition).issues.find(
      (item) => item.property === "label",
    )
    expect(issue).toMatchObject({
      code: "property_too_long",
      params: { max: 20 },
      nodeId: "n_name",
    })
  })

  it("rejects duplicate names across screens and unknown references", () => {
    const definition = twoScreenDefinition()
    const terms = definition.screens[1]?.children[1]
    if (terms) {
      terms.props.name = "full_name"
    }
    const body = definition.screens[1]?.children[0]
    if (body) {
      body.props.text = "Hi ${form.nobody} ${data.x}"
    }
    const result = codes(definition)
    expect(result).toContain("name_duplicate")
    expect(result).toContain("reference_unknown")
    expect(result).toContain("data_reference_unsupported")
  })

  it("checks If nesting, allowed children and Footer branches", () => {
    const definition = twoScreenDefinition()
    const nested = (
      depth: number,
    ): MiniAppDefinition["screens"][number]["children"][number] => ({
      id: `n_if_${depth}`,
      type: "If",
      props: { condition: "${form.full_name} == 'a'" },
      slots: {
        then:
          depth > 1
            ? [nested(depth - 1)]
            : [
                {
                  id: `n_leaf_${depth}`,
                  type: "TextBody",
                  props: { text: "x" },
                },
              ],
        else: [],
      },
    })
    definition.screens[0]?.children.splice(1, 0, nested(4))
    definition.screens[0]?.children.splice(1, 0, {
      id: "n_if_footer",
      type: "If",
      props: { condition: "true" },
      slots: {
        then: [
          {
            id: "n_photo",
            type: "PhotoPicker",
            props: { name: "photo", label: "Photo" },
          },
        ],
        else: [],
      },
    })
    const result = codes(definition)
    expect(result).toContain("if_too_deep")
    expect(result).toContain("child_not_allowed")
  })

  it("flags navigation to a missing screen and screens without an exit", () => {
    const definition = twoScreenDefinition()
    const footer = definition.screens[0]?.children[2]
    if (footer) {
      footer.props["on-click-action"] = { name: "navigate", next: "s_missing" }
    }
    const result = codes(definition)
    expect(result).toContain("navigate_target_missing")
    expect(result).toContain("screen_unreachable")
  })

  it("accepts several files while the response stays within Meta's limit", () => {
    const definition = twoScreenDefinition()
    definition.screens[1]?.children.splice(0, 0, {
      id: "n_docs",
      type: "DocumentPicker",
      props: { name: "docs", label: "Docs", "max-uploaded-documents": 3 },
    })
    expect(codes(definition)).not.toContain("picker_multiple_in_complete")
  })

  it("rejects properties Meta does not declare for the component", () => {
    const definition = twoScreenDefinition()
    const input = definition.screens[0]?.children[1]
    if (input) {
      input.props.enabled = false
      input.props.placeholder = "x"
    }
    const issue = validateMiniApp(definition).issues.find(
      (item) => item.code === "property_unknown",
    )
    expect(issue?.params?.name).toBe("enabled, placeholder")
  })

  it("rejects `required` on file pickers", () => {
    const definition = twoScreenDefinition()
    definition.screens[0]?.children.splice(1, 0, {
      id: "n_photo",
      type: "PhotoPicker",
      props: { name: "photo", label: "Photo", required: true },
    })
    expect(codes(definition)).toContain("property_unknown")
  })

  it("checks Footer captions, Chips options and NavigationList badges", () => {
    const definition = twoScreenDefinition()
    const footer = definition.screens[1]?.children.at(-1)
    if (footer) {
      footer.props["left-caption"] = "Left"
    }
    definition.screens[0]?.children.splice(1, 0, {
      id: "n_chips",
      type: "ChipsSelector",
      props: {
        name: "chips",
        label: "Chips",
        "data-source": [{ id: "a", title: "A" }],
      },
    })
    const result = codes(definition)
    expect(result).toContain("footer_captions_invalid")
    expect(result).toContain("property_too_short")
  })

  describe("files in the response message", () => {
    // Meta sends at most 10 files when the flow completes.
    type RouteSpec = {
      key: string
      /** A PhotoPicker with this maximum; "unset" leaves the maximum out. */
      files?: number | "unset"
      next?: string[]
      complete?: boolean
    }
    const routed = (specs: RouteSpec[]): MiniAppDefinition => ({
      screens: specs.map((spec) => ({
        key: spec.key,
        id: spec.key.toUpperCase(),
        title: spec.key,
        children: [
          ...(spec.files === undefined
            ? []
            : [
                {
                  id: `p_${spec.key}`,
                  type: "PhotoPicker" as const,
                  props: {
                    name: `photo_${spec.key}`,
                    label: "Photo",
                    ...(spec.files === "unset"
                      ? {}
                      : { "max-uploaded-photos": spec.files }),
                  },
                },
              ]),
          ...(spec.next ?? []).map((target, index) => ({
            id: `l_${spec.key}_${index}`,
            type: "EmbeddedLink" as const,
            props: {
              text: "Go",
              "on-click-action": { name: "navigate", next: target },
            },
          })),
          ...(spec.complete
            ? [
                {
                  id: `d_${spec.key}`,
                  type: "Footer" as const,
                  props: {
                    label: "Done",
                    "on-click-action": { name: "complete" },
                  },
                },
              ]
            : []),
        ],
      })),
    })
    const isTooMany = (specs: RouteSpec[]) =>
      codes(routed(specs)).includes("picker_multiple_in_complete")

    it.each([
      [10, false],
      [11, true],
    ])("a single picker of up to %i files: rejected is %s", (files, rejected) => {
      expect(isTooMany([{ key: "sa", files, complete: true }])).toBe(rejected)
    })

    it("adds the pickers of screens visited one after the other", () => {
      expect(
        isTooMany([
          { key: "sa", files: 6, next: ["sb"] },
          { key: "sb", files: 5, complete: true },
        ]),
      ).toBe(true)
      expect(
        isTooMany([
          { key: "sa", files: 5, next: ["sb"] },
          { key: "sb", files: 5, complete: true },
        ]),
      ).toBe(false)
    })

    it("adds exclusive branches together, as the payload references both", () => {
      const branches = (sc: number): RouteSpec[] => [
        { key: "sa", next: ["sb", "sc"] },
        { key: "sb", files: 6, next: ["sd"] },
        { key: "sc", files: sc, next: ["sd"] },
        { key: "sd", complete: true },
      ]
      expect(isTooMany(branches(4))).toBe(false)
      expect(isTooMany(branches(5))).toBe(true)
    })

    it("counts screens that can loop back to each other once", () => {
      const loop = (last: number): RouteSpec[] => [
        { key: "sa", files: 3, next: ["sb"] },
        { key: "sb", files: 3, next: ["sa", "sc"] },
        { key: "sc", files: last, complete: true },
      ]
      expect(isTooMany(loop(4))).toBe(false)
      expect(isTooMany(loop(5))).toBe(true)
    })

    it("treats a picker without a maximum as the web limit", () => {
      expect(isTooMany([{ key: "sa", files: "unset", complete: true }])).toBe(
        true,
      )
    })

    it("reports the completing screen and Meta's maximum", () => {
      const issue = validateMiniApp(
        routed([
          { key: "sa", files: 6, next: ["sb"] },
          { key: "sb", files: 6, complete: true },
        ]),
      ).issues.find((item) => item.code === "picker_multiple_in_complete")

      expect(issue).toMatchObject({ screenKey: "sb", params: { max: 10 } })
    })

    it("checks a completing screen the first screen cannot reach", () => {
      // A Flow can be opened on any screen, so a detached screen still counts.
      expect(
        isTooMany([
          { key: "sa", complete: true },
          { key: "sb", files: 11, complete: true },
        ]),
      ).toBe(true)
    })

    it("counts routes that start on a later screen", () => {
      expect(
        isTooMany([
          { key: "sa", complete: true },
          { key: "sb", files: 6, next: ["sc"] },
          { key: "sc", files: 5, complete: true },
        ]),
      ).toBe(true)
    })

    it("accepts a detached completing screen within the limit", () => {
      expect(
        isTooMany([
          { key: "sa", complete: true },
          { key: "sb", files: 10, complete: true },
        ]),
      ).toBe(false)
    })

    it("survives navigation to a screen that does not exist", () => {
      expect(() =>
        validateMiniApp(
          routed([{ key: "sa", files: 1, next: ["sx"], complete: true }]),
        ),
      ).not.toThrow()
    })
  })
})
