import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import type { ButtonStepProps } from "./button"
import {
  buttonStepDefaultFn,
  buttonStepSchema,
  buttonTypes,
  mergeTemplateButtonsWithExisting,
  refineNoCallPhoneNumberButtons,
} from "./button"
import { openMiniAppStepDefaultFn } from "./open-mini-app"
import { stepTypes } from "./step-action"
import type { ParameterInfo } from "./wa-template-utils"

export const messengerTemplateButtonParamSchema = z.object({
  sub_type: z
    .enum(["url", "phone_number"])
    .describe("Button kind: `url` or `phone_number`."),
  index: z
    .number()
    .optional()
    .describe("Zero-based position of the button in the template."),
  text: z
    .string()
    .optional()
    .describe(
      "Variable value for a `url` button (the dynamic URL suffix). For a Mini App or Minigame link, leave it blank to send each recipient's own token (`{{mini_app_token}}` / `{{minigame_play_token}}`); a fixed value would not identify the contact.",
    ),
  payload: z
    .string()
    .optional()
    .describe(
      "Legacy; ignored by the sender. POSTBACK payloads come from the step's `buttons` configuration, so configure buttons there.",
    ),
})
export type MessengerTemplateButtonParam = z.infer<
  typeof messengerTemplateButtonParamSchema
>

export const messengerTemplateParamsSchema = z.object({
  header: z
    .array(
      z.object({
        type: z
          .enum(["text", "image"])
          .describe("Header parameter kind; fill the matching field."),
        text: z
          .string()
          .optional()
          .describe("Value for a `text` header variable."),
        parameter_name: z
          .string()
          .optional()
          .describe("Placeholder name, only for NAMED templates."),
        image: z
          .object({
            link: z.string().describe("Public https URL of the image."),
          })
          .optional()
          .describe("Image for an `image` header."),
      }),
    )
    .optional()
    .describe("Header parameters; one entry for a templated header."),
  body: z
    .array(
      z.object({
        text: z.string().describe("Value that replaces the variable."),
        parameter_name: z
          .string()
          .optional()
          .describe("Placeholder name, only for NAMED templates."),
      }),
    )
    .optional()
    .describe("Body variables in order: {{1}}, {{2}}, ..."),
  button: z
    .array(messengerTemplateButtonParamSchema)
    .optional()
    .describe("Parameters for the template's dynamic buttons, by `index`."),
})
export type MessengerTemplateParams = z.infer<
  typeof messengerTemplateParamsSchema
>

export type MessengerTemplateComponent = {
  type: string
  format?: string
  text?: string
  example?: unknown
  buttons?: MessengerTemplateComponentButton[]
}

export type MessengerTemplateComponentButton = {
  type: string
  text: string
  url?: string
  payload?: string
  phone_number?: string
  example?: string[]
}

export const sendMessengerTemplateMessageStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendMessengerTemplateMessage)
    .describe('Step type discriminator: "sendMessengerTemplateMessage".'),
  template: z.object({
    id: z.string().trim().min(1),
    name: z.string(),
    language: z.string(),
    parameterFormat: z.enum(["POSITIONAL", "NAMED"]).default("POSITIONAL"),
    params: messengerTemplateParamsSchema,
    // UI state — filters templates by inbox in the editor.
    // Zod strips unknown fields on parse() — without these, useWatch returns
    // undefined after save/reload, breaking inbox-based template filtering.
    inboxId: z.string().optional(),
    integrationMessengerId: z.string().optional(),
  }),
  // Messenger utility messages have no delivery-status webhook, so this step
  // behaves like a normal send (linear continuation) — no Delivered/Failed
  // branching. Optional buttons mirror other send steps (e.g. sendText).
  // An `openMiniApp` button stands for one of the template's Mini App URL
  // buttons (see `extractMessengerFlowButtons`): its edge is where the flow
  // continues once the contact submits that Mini App.
  buttons: z
    .array(buttonStepSchema)
    .superRefine(refineNoCallPhoneNumberButtons)
    .default([]),
})

export type SendMessengerTemplateMessageStepSchema = z.infer<
  typeof sendMessengerTemplateMessageStepSchema
>

export const sendMessengerTemplateMessageStepDefaultFn = (
  props: Partial<SendMessengerTemplateMessageStepSchema> = {},
): SendMessengerTemplateMessageStepSchema => {
  const { template: templateProps, ...restProps } = props
  return {
    template: {
      id: "",
      name: "",
      language: "",
      parameterFormat: "POSITIONAL",
      params: {},
      ...templateProps,
    },
    buttons: [],
    ...restProps,
    id: createId(),
    stepType: stepTypes.enum.sendMessengerTemplateMessage,
  }
}

type MessengerParameterFormat = "POSITIONAL" | "NAMED"

// Matches a positional ({{1}}) or named ({{order_id}}) placeholder. `.match()`
// resets lastIndex per call, so a shared global regex is safe under concurrent
// sends.
const TEMPLATE_PLACEHOLDER_REGEX = /\{\{(\d+|[a-zA-Z_]+)\}\}/g
const PLACEHOLDER_BRACES_REGEX = /\{\{|\}\}/g

function extractPlaceholderNames(text: string | undefined): string[] {
  return (text?.match(TEMPLATE_PLACEHOLDER_REGEX) ?? []).map((match) =>
    match.replace(PLACEHOLDER_BRACES_REGEX, ""),
  )
}

function hasPlaceholder(text: string | undefined): boolean {
  return extractPlaceholderNames(text).length > 0
}

// Public Mini App and Minigame links carry a per-contact token as their last
// query parameter. In a Messenger template that token becomes the URL button's
// dynamic suffix: a pasted `.../mini-apps?id=1&token={{mini_app_token}}` is
// saved as `.../mini-apps?id=1&token={{1}}`, and at send time the `{{1}}` gets
// the matching system variable, minted for each recipient. Both directions use
// the same page/variable pairs so a link saved with `{{1}}` is always filled.
const TOKEN_URL_PAGES = [
  { page: "mini-apps", variable: "mini_app_token" },
  { page: "minigames", variable: "minigame_play_token" },
] as const

type MessengerUrlTokenVariable = (typeof TOKEN_URL_PAGES)[number]["variable"]

function tokenUrlPattern(page: string, placeholder: string): RegExp {
  return new RegExp(`/${page}\\?(?:[^#]*&)?token=\\{\\{${placeholder}\\}\\}$`)
}

const TOKEN_URL_SUFFIXES = TOKEN_URL_PAGES.map((entry) => ({
  variable: entry.variable,
  // A pasted link, still ending in its own token variable.
  pastedPattern: tokenUrlPattern(entry.page, `\\s*${entry.variable}\\s*`),
  // A saved template link, ending in a positional or named suffix.
  savedPattern: tokenUrlPattern(entry.page, "\\w+"),
}))

const TOKEN_VARIABLE_PATTERN = new RegExp(
  `\\{\\{\\s*(${TOKEN_URL_PAGES.map((entry) => entry.variable).join("|")})\\s*\\}\\}`,
)
const TRAILING_PLACEHOLDER_PATTERN = /\{\{[^{}]*\}\}$/

/**
 * Token variable (`mini_app_token` / `minigame_play_token`) used anywhere in
 * `text`, or null.
 */
export function findMessengerTokenVariable(
  text: string | undefined,
): MessengerUrlTokenVariable | null {
  const match = text?.match(TOKEN_VARIABLE_PATTERN)
  return (match?.[1] as MessengerUrlTokenVariable | undefined) ?? null
}

/**
 * For a pasted Mini App or Minigame link that ends in its token variable,
 * the link with that suffix swapped for the positional `{{1}}` Meta accepts;
 * otherwise null.
 */
export function normalizeMessengerTokenUrl(
  url: string,
): { url: string; variable: MessengerUrlTokenVariable } | null {
  const match = TOKEN_URL_SUFFIXES.find((entry) =>
    entry.pastedPattern.test(url),
  )
  if (!match) {
    return null
  }
  return {
    url: url.replace(TRAILING_PLACEHOLDER_PATTERN, "{{1}}"),
    variable: match.variable,
  }
}

const MINI_APP_URL_PATTERN = tokenUrlPattern("mini-apps", "\\w+")
const MINI_APP_ID_PATTERN = /[?&]id=(\d+)(?:&|$)/

export type MessengerMiniAppButton = {
  /** Position among the template's buttons, the same `index` its URL param has. */
  index: number
  label: string
  miniAppId: string
}

/**
 * The template's URL buttons that open a Mini App (its public link, saved with
 * a `{{1}}` token suffix), in template order.
 */
export function readMessengerMiniAppButtons(
  components: MessengerTemplateComponent[],
): MessengerMiniAppButton[] {
  const miniAppButtons: MessengerMiniAppButton[] = []
  for (const component of components ?? []) {
    if (component.type !== "BUTTONS" || !component.buttons) {
      continue
    }
    for (const [index, button] of component.buttons.entries()) {
      const url = button.url ?? ""
      const miniAppId = url.match(MINI_APP_ID_PATTERN)?.[1]
      if (
        button.type.toUpperCase() === "URL" &&
        miniAppId &&
        MINI_APP_URL_PATTERN.test(url)
      ) {
        miniAppButtons.push({ index, label: button.text ?? "", miniAppId })
      }
    }
  }
  return miniAppButtons
}

/**
 * Suggested value for a dynamic URL button's suffix: the token variable for a
 * Mini App or Minigame link, otherwise an empty string.
 */
export function suggestMessengerUrlSuffixVariable(
  url: string | undefined,
): string {
  const match = TOKEN_URL_SUFFIXES.find((entry) =>
    entry.savedPattern.test(url ?? ""),
  )
  return match ? `{{${match.variable}}}` : ""
}

// NAMED templates echo each placeholder back as `parameter_name`; POSITIONAL
// ones must omit the key entirely.
function toParameterName(
  name: string,
  parameterFormat: MessengerParameterFormat,
): { parameter_name?: string } {
  return parameterFormat === "NAMED" ? { parameter_name: name } : {}
}

export function extractMessengerTemplateParams(
  components: MessengerTemplateComponent[],
  parameterFormat: MessengerParameterFormat,
): MessengerTemplateParams {
  const params: MessengerTemplateParams = {}

  if (!components || components.length === 0) {
    return params
  }

  for (const component of components) {
    if (component.type === "HEADER") {
      // Placeholders in a header's text are send-time parameters whatever the
      // format: a "text and image" template is an IMAGE header with text, and
      // Meta rejects the send with (#100 - 1893029) "Missing one or more
      // header params" when its variable is left out. The image itself is
      // fixed at template creation via header_handle and is never a parameter.
      const names = extractPlaceholderNames(component.text)
      if (names.length > 0) {
        params.header = names.map((name) => ({
          type: "text",
          text: "",
          ...toParameterName(name, parameterFormat),
        }))
      }
    } else if (component.type === "BODY") {
      const names = extractPlaceholderNames(component.text)
      if (names.length > 0) {
        params.body = names.map((name) => ({
          text: "",
          ...toParameterName(name, parameterFormat),
        }))
      }
    } else if (component.type === "BUTTONS" && component.buttons) {
      const buttonParams: MessengerTemplateButtonParam[] = []

      for (const [idx, button] of component.buttons.entries()) {
        const buttonType = button.type.toUpperCase()

        if (buttonType === "URL" && button.url) {
          // A dynamic URL ends in one suffix placeholder — {{1}}, or a named
          // one like {{url_suffix}} in NAMED templates — whose value the user
          // fills in; a static URL is sent as is. A Mini App or Minigame link
          // defaults its suffix to the recipient's token variable.
          buttonParams.push({
            sub_type: "url",
            index: idx,
            text: hasPlaceholder(button.url)
              ? suggestMessengerUrlSuffixVariable(button.url)
              : button.url,
          })
        }
        if (buttonType === "PHONE_NUMBER") {
          buttonParams.push({
            sub_type: "phone_number",
            index: idx,
          })
        }
        // POSTBACK/QUICK_REPLY buttons are handled as flow buttons (step.buttons[]),
        // not as template params. See extractMessengerFlowButtons.
      }

      if (buttonParams.length > 0) {
        params.button = buttonParams
      }
    }
  }

  return params
}

export function extractMessengerParameterInfos(
  components: MessengerTemplateComponent[],
  parameterFormat: MessengerParameterFormat,
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  if (!components || components.length === 0) {
    return params
  }

  const toDisplayName = (name: string, idx: number) =>
    parameterFormat === "NAMED" ? name : String(idx + 1)

  for (const component of components) {
    if (component.type === "HEADER") {
      // Same rule as extractMessengerTemplateParams: header placeholders are
      // send-time parameters in any header format (TEXT or IMAGE).
      for (const [idx, name] of extractPlaceholderNames(
        component.text,
      ).entries()) {
        params.push({
          type: "header",
          index: idx,
          paramName: toDisplayName(name, idx),
          format: "text",
        })
      }
    } else if (component.type === "BODY") {
      for (const [idx, name] of extractPlaceholderNames(
        component.text,
      ).entries()) {
        params.push({
          type: "body",
          index: idx,
          paramName: toDisplayName(name, idx),
        })
      }
    } else if (component.type === "BUTTONS" && component.buttons) {
      for (const [buttonIdx, button] of component.buttons.entries()) {
        const buttonType = button.type.toUpperCase()

        const [urlSuffixName] = extractPlaceholderNames(button.url)
        if (buttonType === "URL" && urlSuffixName) {
          params.push({
            type: "button",
            index: 0,
            paramName: toDisplayName(urlSuffixName, 0),
            buttonIndex: buttonIdx,
            buttonSubType: "url",
          })
        }
        // POSTBACK/QUICK_REPLY buttons are handled as flow buttons (step.buttons[]),
        // not as ParameterInfo entries. See extractMessengerFlowButtons.
      }
    }
  }

  return params
}

/**
 * The template buttons a flow step routes, in template order: every dynamic
 * POSTBACK / QUICK_REPLY button, and — with `includeMiniApp` — every Mini App
 * URL button as an `openMiniApp` button, whose edge is followed once the
 * contact submits that Mini App. Broadcasts leave `includeMiniApp` off: they
 * have no edge to follow, and their buttons pick a flow per postback.
 */
export function extractMessengerFlowButtons(
  components: MessengerTemplateComponent[],
  options: { includeMiniApp?: boolean } = {},
): ButtonStepProps[] {
  const buttons: ButtonStepProps[] = []

  if (!components || components.length === 0) {
    return buttons
  }

  const miniAppButtonsByIndex = new Map(
    options.includeMiniApp
      ? readMessengerMiniAppButtons(components).map((button) => [
          button.index,
          button,
        ])
      : [],
  )

  for (const component of components) {
    if (component.type === "BUTTONS" && component.buttons) {
      for (const [index, button] of component.buttons.entries()) {
        const buttonType = button.type.toUpperCase()
        const miniAppButton = miniAppButtonsByIndex.get(index)

        if (miniAppButton) {
          buttons.push({
            ...buttonStepDefaultFn({ label: miniAppButton.label }),
            buttonType: buttonTypes.enum.openMiniApp,
            beforeStep: openMiniAppStepDefaultFn({
              miniAppId: miniAppButton.miniAppId,
            }),
          })
        } else if (
          (buttonType === "POSTBACK" || buttonType === "QUICK_REPLY") &&
          button.payload?.includes("{{")
        ) {
          buttons.push(buttonStepDefaultFn({ label: button.text ?? "" }))
        }
        // Other URL buttons and POSTBACK buttons without "{{" in payload are NOT included.
      }
    }
  }

  return buttons
}

const isOpenMiniApp = (button: ButtonStepProps | undefined) =>
  button?.buttonType === buttonTypes.enum.openMiniApp

/**
 * Pairs template buttons with the step's existing ones by position, keeping an
 * existing button's id, action and edge. A slot that switched between a
 * postback and a Mini App button takes the template's new button instead, and
 * a Mini App button follows the template's Mini App.
 */
export function mergeMessengerFlowButtonsWithExisting(
  templateButtons: ButtonStepProps[],
  existingButtons: ButtonStepProps[] = [],
): ButtonStepProps[] {
  const merged = mergeTemplateButtonsWithExisting(
    templateButtons,
    existingButtons,
  )
  return merged.map((button, index) => {
    const templateButton = templateButtons[index]
    if (!templateButton || button === templateButton) {
      return button
    }
    if (isOpenMiniApp(button) !== isOpenMiniApp(templateButton)) {
      return templateButton
    }
    if (
      button.buttonType === buttonTypes.enum.openMiniApp &&
      templateButton.buttonType === buttonTypes.enum.openMiniApp &&
      button.beforeStep.miniAppId !== templateButton.beforeStep.miniAppId
    ) {
      return {
        ...button,
        beforeStep: {
          ...button.beforeStep,
          miniAppId: templateButton.beforeStep.miniAppId,
        },
      }
    }
    return button
  })
}
