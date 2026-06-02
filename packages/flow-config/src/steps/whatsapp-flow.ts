import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { type ButtonStepProps, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const WHATSAPP_FLOW_BODY_MAX = 1024
export const WHATSAPP_FLOW_BUTTON_MAX = 20
export const WHATSAPP_FLOW_PARAM_KEY_MAX = 64

export const whatsappFlowFieldMappingSchema = z.object({
  paramKey: z.string().trim().min(1).max(WHATSAPP_FLOW_PARAM_KEY_MAX),
  paramLabel: z.string().optional(),
  customFieldId: zodBigintAsString().nullable(),
})
export type WhatsappFlowFieldMapping = z.infer<
  typeof whatsappFlowFieldMappingSchema
>

export const whatsappFlowDataSchema = z.object({
  id: zodBigintAsString().nullable(),
  sourceId: z.string(),
  startScreenId: z.string().nullable(),
  fieldMappings: z.array(whatsappFlowFieldMappingSchema),
})
export type WhatsappFlowData = z.infer<typeof whatsappFlowDataSchema>

export const whatsappFlowStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.whatsappFlow),
  text: z.string().trim().min(1).max(WHATSAPP_FLOW_BODY_MAX),
  buttons: z.array(buttonStepSchema).min(1).max(1),
  inboxId: zodBigintAsString().nullable(),
  flow: whatsappFlowDataSchema,
})
export type WhatsappFlowStepSchema = z.infer<typeof whatsappFlowStepSchema>

export const whatsappFlowDialogFormSchema = z.object({
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_FLOW_BUTTON_MAX),
  flow: whatsappFlowDataSchema.extend({
    id: zodBigintAsString(),
    sourceId: z.string().trim().min(1),
    startScreenId: z.string().trim().min(1),
  }),
})
export type WhatsappFlowDialogFormValues = z.infer<
  typeof whatsappFlowDialogFormSchema
>

export const whatsappFlowDefaultButton = (
  label = "button #1",
): ButtonStepProps => ({
  id: createId(),
  label,
  buttonType: null,
  beforeStep: null,
  steps: [],
})

export const whatsappFlowStepDefaultFn = (
  props: Partial<WhatsappFlowStepSchema> = {},
): WhatsappFlowStepSchema => ({
  text: "",
  buttons: [whatsappFlowDefaultButton()],
  inboxId: null,
  flow: {
    id: null,
    sourceId: "",
    startScreenId: null,
    fieldMappings: [],
  },
  ...props,
  id: createId(),
  stepType: stepTypes.enum.whatsappFlow,
})
