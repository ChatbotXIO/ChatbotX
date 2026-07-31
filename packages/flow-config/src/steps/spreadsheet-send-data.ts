import { z } from "zod"
import {
  spreadsheetContactToSheetMappingSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
  spreadsheetStepVersions,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetSendDataSchema = spreadsheetSchema.extend({
  stepType: z.literal(stepTypes.enum.spreadsheetSendData),
  version: spreadsheetStepVersions
    .catch(spreadsheetStepVersions.enum.v1)
    .default(spreadsheetStepVersions.enum.v1),
  map: z.array(spreadsheetContactToSheetMappingSchema).min(1),
})
export type SpreadsheetSendDataSchema = z.infer<
  typeof spreadsheetSendDataSchema
>

export const spreadsheetSendDataDefaultFn = (): SpreadsheetSendDataSchema => ({
  ...spreadsheetDefaultFn(),
  stepType: stepTypes.enum.spreadsheetSendData,
  version: spreadsheetStepVersions.enum.v2,
  map: [],
})
