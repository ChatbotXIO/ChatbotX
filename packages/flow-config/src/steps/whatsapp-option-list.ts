import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema, buttonTypes } from "./button"
import { stepTypes } from "./step-action"

export const WHATSAPP_OPTION_LIST_MIN_OPTIONS = 2
export const WHATSAPP_OPTION_LIST_MAX_OPTIONS = 10
export const WHATSAPP_OPTION_LIST_BUTTON_MAX = 20
export const WHATSAPP_OPTION_LIST_TITLE_MAX = 24
export const WHATSAPP_OPTION_LIST_DESCRIPTION_MAX = 72
export const WHATSAPP_OPTION_LIST_BODY_MAX = 1024

export const whatsappOptionListButtonSchema = buttonStepSchema.and(
  z.object({
    label: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_TITLE_MAX),
    description: z
      .string()
      .trim()
      .max(WHATSAPP_OPTION_LIST_DESCRIPTION_MAX)
      .optional(),
  }),
)

export type WhatsappOptionListButton = z.infer<
  typeof whatsappOptionListButtonSchema
>

export const whatsappOptionListStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.whatsappOptionList),
  text: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_BODY_MAX),
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_BUTTON_MAX),
  buttons: z
    .array(whatsappOptionListButtonSchema)
    .min(WHATSAPP_OPTION_LIST_MIN_OPTIONS)
    .max(WHATSAPP_OPTION_LIST_MAX_OPTIONS),
})

export type WhatsappOptionListStepSchema = z.infer<
  typeof whatsappOptionListStepSchema
>

export const whatsappOptionListButtonLabelFormSchema = z.object({
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_BUTTON_MAX),
})
export type WhatsappOptionListButtonLabelFormValues = z.infer<
  typeof whatsappOptionListButtonLabelFormSchema
>

export const whatsappOptionListOptionFormSchema = z.object({
  title: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_TITLE_MAX),
  description: z
    .string()
    .trim()
    .max(WHATSAPP_OPTION_LIST_DESCRIPTION_MAX)
    .optional()
    .or(z.literal("")),
})
export type WhatsappOptionListOptionFormValues = z.infer<
  typeof whatsappOptionListOptionFormSchema
>

export const whatsappOptionListButtonDefaultFn = (
  props: { label: string } & Partial<
    Pick<WhatsappOptionListButton, "description">
  >,
): WhatsappOptionListButton => ({
  id: createId(),
  buttonType: buttonTypes.enum.whatsappOptionList,
  beforeStep: null,
  steps: [],
  ...props,
})

export const whatsappOptionListStepDefaultFn = (
  props: Partial<WhatsappOptionListStepSchema> = {},
): WhatsappOptionListStepSchema => ({
  text: "",
  buttonLabel: "button #1",
  buttons: [
    whatsappOptionListButtonDefaultFn({ label: "Title #1" }),
    whatsappOptionListButtonDefaultFn({ label: "Title #2" }),
  ],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.whatsappOptionList,
})
