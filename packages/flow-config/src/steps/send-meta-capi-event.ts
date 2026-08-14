import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const metaCapiFlowEventNameSchema = z.enum(["LeadSubmitted"])

// Treat an empty/blank string (a cleared input field) as "unset" so users can
// remove a previously entered value/currency without hitting regex validation.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

export const metaCapiValueSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
)

export const metaCapiCurrencySchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{3}$/))
    .optional(),
)

// Optional Meta Pixel content properties (content_category / content_name),
// passed through CAPI custom_data.
export const metaCapiContentTextSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(200).optional(),
)

export const sendMetaCapiEventSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.sendMetaCapiEvent),
  eventName: metaCapiFlowEventNameSchema.default("LeadSubmitted"),
  value: metaCapiValueSchema,
  currency: metaCapiCurrencySchema,
  contentCategory: metaCapiContentTextSchema,
  contentName: metaCapiContentTextSchema,
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type SendMetaCapiEventSchema = z.infer<typeof sendMetaCapiEventSchema>

export const sendMetaCapiEventDefaultFn = (): SendMetaCapiEventSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendMetaCapiEvent,
  eventName: "LeadSubmitted",
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
