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

export function extractMessengerTemplateParams(
  components: MessengerTemplateComponent[],
  parameterFormat: "POSITIONAL" | "NAMED",
): MessengerTemplateParams {
  const params: MessengerTemplateParams = {}

  if (!components || components.length === 0) {
    return params
  }

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          params.header = matches.map((match) => {
            const paramName = match.replace(/\{\{|\}\}/g, "")
            const item: MessengerTemplateParams["header"] extends
              | (infer T)[]
              | undefined
              ? T
              : never = { type: "text", text: "" }
            if (parameterFormat === "NAMED") {
              item.parameter_name = paramName
            }
            return item
          })
        }
      }
      // IMAGE headers are fixed at template creation time via header_handle;
      // no parameter is collected or sent at send-time.
    } else if (component.type === "BODY" && component.text) {
      const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
      if (matches) {
        params.body = matches.map((match) => {
          const paramName = match.replace(/\{\{|\}\}/g, "")
          const item: MessengerTemplateParams["body"] extends
            | (infer T)[]
            | undefined
            ? T
            : never = { text: "" }
          if (parameterFormat === "NAMED") {
            item.parameter_name = paramName
          }
          return item
        })
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
  parameterFormat: "POSITIONAL" | "NAMED",
): ParameterInfo[] {
  const params: ParameterInfo[] = []

  if (!components || components.length === 0) {
    return params
  }

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text) {
        const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
        if (matches) {
          for (const [idx, match] of matches.entries()) {
            const paramName = match.replace(/\{\{|\}\}/g, "")
            params.push({
              type: "header",
              index: idx,
              paramName:
                parameterFormat === "NAMED" ? paramName : String(idx + 1),
              format: "text",
            })
          }
        }
      }
      // IMAGE headers are fixed at template creation; no send-time ParameterInfo.
    } else if (component.type === "BODY" && component.text) {
      const matches = component.text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g)
      if (matches) {
        for (const [idx, match] of matches.entries()) {
          const paramName = match.replace(/\{\{|\}\}/g, "")
          params.push({
            type: "body",
            index: idx,
            paramName:
              parameterFormat === "NAMED" ? paramName : String(idx + 1),
          })
        }
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
