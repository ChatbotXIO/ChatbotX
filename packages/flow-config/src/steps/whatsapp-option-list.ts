import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

export const WHATSAPP_OPTION_LIST_MIN_OPTIONS = 2
export const WHATSAPP_OPTION_LIST_MAX_OPTIONS = 10
export const WHATSAPP_OPTION_LIST_BUTTON_MAX = 20
export const WHATSAPP_OPTION_LIST_TITLE_MAX = 24
export const WHATSAPP_OPTION_LIST_DESCRIPTION_MAX = 72
export const WHATSAPP_OPTION_LIST_BODY_MAX = 1024

export const whatsappOptionListItemSchema = z.object({
  id: zodBigintAsString(),
  title: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_TITLE_MAX),
  description: z
    .string()
    .trim()
    .max(WHATSAPP_OPTION_LIST_DESCRIPTION_MAX)
    .optional(),
})
export type WhatsappOptionListItem = z.infer<
  typeof whatsappOptionListItemSchema
>

export const whatsappOptionListStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.whatsappOptionList),
  text: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_BODY_MAX),
  buttonId: zodBigintAsString(),
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_OPTION_LIST_BUTTON_MAX),
  options: z
    .array(whatsappOptionListItemSchema)
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

export const whatsappOptionListItemDefaultFn = (
  props: Partial<WhatsappOptionListItem> = {},
): WhatsappOptionListItem => ({
  title: "",
  ...props,
  id: createId(),
})

export const whatsappOptionListStepDefaultFn = (
  props: Partial<WhatsappOptionListStepSchema> = {},
): WhatsappOptionListStepSchema => ({
  text: "",
  buttonLabel: "button #1",
  options: [
    whatsappOptionListItemDefaultFn({ title: "Title #1" }),
    whatsappOptionListItemDefaultFn({ title: "Title #2" }),
  ],
  ...props,
  id: createId(),
  buttonId: createId(),
  stepType: stepTypes.enum.whatsappOptionList,
})
