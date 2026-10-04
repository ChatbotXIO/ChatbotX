import { z } from "zod"
import {
  spreadsheetContactToSheetMappingSchema,
  spreadsheetDefaultFn,
  spreadsheetSchema,
  spreadsheetStepVersions,
} from "./spreadsheet"
import { stepTypes } from "./step-action"

export const spreadsheetSendDataSchema = spreadsheetSchema.extend({
  stepType: z
    .literal(stepTypes.enum.spreadsheetSendData)
    .describe('Step type discriminator: "spreadsheetSendData".'),
  version: spreadsheetStepVersions
    .catch(spreadsheetStepVersions.enum.v1)
    .default(spreadsheetStepVersions.enum.v1)
    .describe(
      'Mapping format. Omitted or invalid parses as legacy "v1", where `map[].value` is ignored; set "v2" to write `map[].value`.',
    ),
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
