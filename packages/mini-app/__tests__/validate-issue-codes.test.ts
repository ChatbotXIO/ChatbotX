// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import type { MiniAppDefinition, MiniAppNode } from "../src/types"
import { type MiniAppIssueCode, validateMiniApp } from "../src/validate"
import { twoScreenDefinition } from "./fixtures"

/** Screen 0 (`WELCOME`) collects a name and navigates; screen 1 (`CONFIRM`) completes. */
const welcome = (definition: MiniAppDefinition) =>
  definition.screens[0] as MiniAppDefinition["screens"][number]
const confirm = (definition: MiniAppDefinition) =>
  definition.screens[1] as MiniAppDefinition["screens"][number]

/** Inserts nodes right before the welcome screen's Footer. */
const addToWelcome = (definition: MiniAppDefinition, ...nodes: MiniAppNode[]) =>
  welcome(definition).children.splice(1, 0, ...nodes)

const nameInput = (definition: MiniAppDefinition) =>
  welcome(definition).children[1] as MiniAppNode
const welcomeFooter = (definition: MiniAppDefinition) =>
  welcome(definition).children[2] as MiniAppNode

const textBody = (id: string, text = "x"): MiniAppNode => ({
  id,
  type: "TextBody",
  props: { text },
})

const navigationList = (
  id: string,
  items: Record<string, unknown>[],
): MiniAppNode => ({
  id,
  type: "NavigationList",
  props: { name: id, "list-items": items },
})

const navigationItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  "main-content": { title: id },
  "on-click-action": { name: "navigate", next: "s_confirm" },
  ...extra,
})

const options = (count: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: count }, (_, index) => ({
    id: `option_${index}`,
    title: `Option ${index}`,
    ...extra,
  }))

const nestedIf = (depth: number): MiniAppNode => ({
  id: `n_if_${depth}`,
  type: "If",
  props: { condition: "true" },
  slots: {
    then: depth > 1 ? [nestedIf(depth - 1)] : [textBody(`n_leaf_${depth}`)],
    else: [],
  },
})

const cases: [
  code: MiniAppIssueCode,
  breakDefinition: (definition: MiniAppDefinition) => void,
][] = [
  [
    "screen_id_invalid",
    (definition) => {
      confirm(definition).id = "1_BAD"
    },
  ],
  [
    "screen_id_reserved",
    (definition) => {
      confirm(definition).id = "SUCCESS"
    },
  ],
  [
    "screen_id_duplicate",
    (definition) => {
      confirm(definition).id = "WELCOME"
    },
  ],
  [
    "no_terminal_screen",
    (definition) => {
      const footer = confirm(definition).children.at(-1) as MiniAppNode
      footer.props["on-click-action"] = undefined
    },
  ],
  [
    "screen_without_exit",
    (definition) => {
      welcome(definition).children.pop()
    },
  ],
  [
    "screen_unreachable",
    (definition) => {
      welcome(definition).children.pop()
    },
  ],
  [
    "too_many_components",
    (definition) => {
      addToWelcome(
        definition,
        ...Array.from({ length: 50 }, (_, index) =>
          textBody(`n_body_${index}`),
        ),
      )
    },
  ],
  [
    "component_limit",
    (definition) => {
      addToWelcome(
        definition,
        ...[1, 2, 3, 4].map((index) => ({
          id: `n_image_${index}`,
          type: "Image" as const,
          props: { src: "AAAA" },
        })),
      )
    },
  ],
  [
    "picker_conflict",
    (definition) => {
      addToWelcome(
        definition,
        {
          id: "n_photo",
          type: "PhotoPicker",
          props: { name: "photo", label: "Photo" },
        },
        {
          id: "n_document",
          type: "DocumentPicker",
          props: { name: "document", label: "Document" },
        },
      )
    },
  ],
  [
    "picker_multiple_in_complete",
    (definition) => {
      addToWelcome(definition, {
        id: "n_photo",
        type: "PhotoPicker",
        props: { name: "photo", label: "Photo", "max-uploaded-photos": 3 },
      })
    },
  ],
  [
    "footer_not_last",
    (definition) => {
      welcome(definition).children.push(textBody("n_late"))
    },
  ],
  [
    "footer_in_nested_branch",
    (definition) => {
      addToWelcome(definition, {
        id: "n_switch",
        type: "Switch",
        props: { value: "${form.full_name}" },
        slots: {
          case_1: [
            {
              id: "n_switch_footer",
              type: "Footer",
              props: {
                label: "Go",
                "on-click-action": { name: "navigate", next: "s_confirm" },
              },
            },
          ],
        },
      })
    },
  ],
  [
    "footer_missing_in_branch",
    (definition) => {
      addToWelcome(definition, {
        id: "n_if",
        type: "If",
        props: { condition: "true" },
        slots: {
          then: [
            {
              id: "n_if_footer",
              type: "Footer",
              props: {
                label: "Go",
                "on-click-action": { name: "navigate", next: "s_confirm" },
              },
            },
          ],
          else: [textBody("n_else")],
        },
      })
    },
  ],
  [
    "navigation_list_with_footer",
    (definition) => {
      addToWelcome(definition, navigationList("menu", [navigationItem("a")]))
    },
  ],
  [
    "navigation_list_on_terminal",
    (definition) => {
      confirm(definition).children.splice(
        0,
        0,
        navigationList("menu", [
          navigationItem("a", {
            "on-click-action": { name: "navigate", next: "s_welcome" },
          }),
        ]),
      )
    },
  ],
  [
    "if_too_deep",
    (definition) => {
      addToWelcome(definition, nestedIf(4))
    },
  ],
  [
    "if_then_empty",
    (definition) => {
      addToWelcome(definition, {
        id: "n_if",
        type: "If",
        props: { condition: "true" },
        slots: { then: [], else: [] },
      })
    },
  ],
  [
    "switch_no_cases",
    (definition) => {
      addToWelcome(definition, {
        id: "n_switch",
        type: "Switch",
        props: { value: "${form.full_name}" },
        slots: {},
      })
    },
  ],
  [
    "child_not_allowed",
    (definition) => {
      addToWelcome(definition, {
        id: "n_if",
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
    },
  ],
  [
    "name_invalid",
    (definition) => {
      nameInput(definition).props.name = "1_bad"
    },
  ],
  [
    "name_duplicate",
    (definition) => {
      addToWelcome(definition, {
        id: "n_name_copy",
        type: "TextInput",
        props: { name: "full_name", label: "Again" },
      })
    },
  ],
  [
    "property_required",
    (definition) => {
      nameInput(definition).props.label = ""
    },
  ],
  [
    "property_too_long",
    (definition) => {
      nameInput(definition).props.label = "This label is far too long for Meta"
    },
  ],
  [
    "property_too_short",
    (definition) => {
      addToWelcome(definition, {
        id: "n_chips",
        type: "ChipsSelector",
        props: { name: "chips", label: "Chips", "data-source": options(1) },
      })
    },
  ],
  [
    "property_invalid",
    (definition) => {
      nameInput(definition).props["input-type"] = "bogus"
    },
  ],
  [
    "option_duplicate_id",
    (definition) => {
      addToWelcome(definition, {
        id: "n_dropdown",
        type: "Dropdown",
        props: {
          name: "pick",
          label: "Pick",
          "data-source": [
            { id: "same", title: "A" },
            { id: "same", title: "B" },
          ],
        },
      })
    },
  ],
  [
    "min_greater_than_max",
    (definition) => {
      nameInput(definition).props["min-chars"] = 10
      nameInput(definition).props["max-chars"] = 5
    },
  ],
  [
    "action_required",
    (definition) => {
      addToWelcome(definition, {
        id: "n_link",
        type: "EmbeddedLink",
        props: { text: "Link" },
      })
    },
  ],
  [
    "action_not_allowed",
    (definition) => {
      welcomeFooter(definition).props["on-click-action"] = {
        name: "open_url",
        url: "https://example.com",
      }
    },
  ],
  [
    "navigate_target_missing",
    (definition) => {
      welcomeFooter(definition).props["on-click-action"] = {
        name: "navigate",
        next: "s_missing",
      }
    },
  ],
  [
    "navigate_self",
    (definition) => {
      welcomeFooter(definition).props["on-click-action"] = {
        name: "navigate",
        next: "s_welcome",
      }
    },
  ],
  [
    "expression_invalid",
    (definition) => {
      addToWelcome(definition, {
        id: "n_if",
        type: "If",
        props: { condition: "((" },
        slots: { then: [textBody("n_then")], else: [] },
      })
    },
  ],
  [
    "reference_invalid",
    (definition) => {
      addToWelcome(definition, textBody("n_ref", "Hi ${nope}"))
    },
  ],
  [
    "reference_unknown",
    (definition) => {
      addToWelcome(definition, textBody("n_ref", "Hi ${form.nobody}"))
    },
  ],
  [
    "data_reference_unsupported",
    (definition) => {
      addToWelcome(definition, textBody("n_ref", "Hi ${data.x}"))
    },
  ],
  [
    "property_unknown",
    (definition) => {
      nameInput(definition).props.enabled = false
    },
  ],
  [
    "footer_captions_invalid",
    (definition) => {
      welcomeFooter(definition).props["left-caption"] = "Left"
    },
  ],
  [
    "options_with_images_limit",
    (definition) => {
      addToWelcome(definition, {
        id: "n_dropdown",
        type: "Dropdown",
        props: {
          name: "pick",
          label: "Pick",
          "data-source": options(101, { image: "AAAA" }),
        },
      })
    },
  ],
  [
    "navigation_badge_multiple",
    (definition) => {
      confirm(definition).children.splice(
        0,
        0,
        navigationList("menu", [
          navigationItem("a", {
            badge: "New",
            "on-click-action": { name: "navigate", next: "s_welcome" },
          }),
          navigationItem("b", {
            badge: "Hot",
            "on-click-action": { name: "navigate", next: "s_welcome" },
          }),
        ]),
      )
    },
  ],
  [
    "contact_variable_whatsapp",
    (definition) => {
      addToWelcome(definition, textBody("n_var", "Hi {{first_name}}"))
    },
  ],
]

const WARNING_CODES = new Set<MiniAppIssueCode>([
  "screen_unreachable",
  "contact_variable_whatsapp",
])

describe("validateMiniApp issue codes", () => {
  it("reports definition_invalid for a definition without screens", () => {
    expect(validateMiniApp({ screens: [] })).toEqual({
      valid: false,
      issues: [{ code: "definition_invalid", severity: "error" }],
    })
  })

  it.each(cases)("reports %s", (code, breakDefinition) => {
    const definition = twoScreenDefinition()
    breakDefinition(definition)
    const issue = validateMiniApp(definition).issues.find(
      (item) => item.code === code,
    )
    expect(issue?.severity).toBe(WARNING_CODES.has(code) ? "warning" : "error")
  })
})
