import { z } from "zod"
import {
  spreadsheetDefaultFn,
  spreadsheetMappingSchema,
  spreadsheetSchema,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetSendDataSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetSendData),
  map: z.array(spreadsheetMappingSchema).min(1),
})
export type SpreadsheetSendDataSchema = z.infer<
  typeof spreadsheetSendDataSchema
>

export const spreadsheetSendDataDefaultFn = (): SpreadsheetSendDataSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: stepTypes.enum.spreadsheetSendData,
  map: [],
})
