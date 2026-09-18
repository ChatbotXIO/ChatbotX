import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import type { ButtonStepProps } from "./button"
import {
  buttonStepDefaultFn,
  buttonStepSchema,
  mergeTemplateButtonsWithExisting,
} from "./button"
import { stepTypes } from "./step-action"
import type { ParameterInfo } from "./wa-template-utils"

export const messengerTemplateButtonParamSchema = z.object({
  sub_type: z.enum(["url", "phone_number"]),
  index: z.number().optional(),
  text: z.string().optional(),
  payload: z.string().optional(),
})
export type MessengerTemplateButtonParam = z.infer<
  typeof messengerTemplateButtonParamSchema
>

export const messengerTemplateParamsSchema = z.object({
  header: z
    .array(
      z.object({
        type: z.enum(["text", "image"]),
        text: z.string().optional(),
        parameter_name: z.string().optional(),
        image: z.object({ link: z.string() }).optional(),
      }),
    )
    .optional(),
  body: z
    .array(
      z.object({
        text: z.string(),
        parameter_name: z.string().optional(),
      }),
    )
    .optional(),
  button: z.array(messengerTemplateButtonParamSchema).optional(),
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
  stepType: z.literal(stepTypes.enum.sendMessengerTemplateMessage),
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
  buttons: z.array(buttonStepSchema).default([]),
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
          buttonParams.push({
            sub_type: "url",
            index: idx,
            text: button.url.includes("{{1}}") ? "" : button.url,
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

        if (buttonType === "URL" && button.url?.includes("{{1}}")) {
          params.push({
            type: "button",
            index: 0,
            paramName: "1",
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

export function extractMessengerFlowButtons(
  components: MessengerTemplateComponent[],
): ButtonStepProps[] {
  const buttons: ButtonStepProps[] = []

  if (!components || components.length === 0) {
    return buttons
  }

  for (const component of components) {
    if (component.type === "BUTTONS" && component.buttons) {
      for (const button of component.buttons) {
        const buttonType = button.type.toUpperCase()

        if (
          (buttonType === "POSTBACK" || buttonType === "QUICK_REPLY") &&
          button.payload?.includes("{{")
        ) {
          buttons.push(buttonStepDefaultFn({ label: button.text ?? "" }))
        }
        // URL buttons and POSTBACK buttons without "{{" in payload are NOT included.
      }
    }
  }

  return buttons
}

export function mergeMessengerFlowButtonsWithExisting(
  templateButtons: ButtonStepProps[],
  existingButtons: ButtonStepProps[] = [],
): ButtonStepProps[] {
  return mergeTemplateButtonsWithExisting(templateButtons, existingButtons)
}
