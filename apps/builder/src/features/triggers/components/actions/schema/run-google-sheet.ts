import { triggerActions } from "@chatbotx.io/database/partials"
import {
  FilterMode,
  spreadsheetColumnFilterSchema,
  spreadsheetContactToSheetMappingSchema,
  spreadsheetSheetToContactMappingSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import z from "zod"

const baseRunGoogleSheetSchema = {
  type: z
    .literal(triggerActions.enum.runGoogleSheet)
    .describe('Action type "runGoogleSheet".'),
  spreadsheetId: z
    .string()
    .describe("Id of the connected Google spreadsheet to operate on."),
  sheetName: z
    .string()
    .describe("Name of the sheet (tab) inside the spreadsheet."),
  lookup: spreadsheetColumnFilterSchema.describe(
    "How to find the target row (ignored by `spreadsheetSendData`, which appends a row).",
  ),
}

export const runGoogleSheet = z.discriminatedUnion("action", [
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z
      .literal(stepTypes.enum.spreadsheetGetRow)
      .describe(
        "Read the first matching row into contact custom fields via `map`.",
      ),
    map: z
      .array(spreadsheetSheetToContactMappingSchema)
      .min(1)
      .describe("Sheet column to contact custom field mappings."),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z
      .literal(stepTypes.enum.spreadsheetGetRandomRow)
      .describe(
        "Read a random matching row into contact custom fields via `map`.",
      ),
    map: z
      .array(spreadsheetSheetToContactMappingSchema)
      .min(1)
      .describe("Sheet column to contact custom field mappings."),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z
      .literal(stepTypes.enum.spreadsheetUpdateRow)
      .describe("Write `map` values into the matching row."),
    map: z
      .array(spreadsheetContactToSheetMappingSchema)
      .min(1)
      .describe("Sheet columns and the values to write into them."),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z
      .literal(stepTypes.enum.spreadsheetSendData)
      .describe("Append a new row built from `map`."),
    map: z
      .array(spreadsheetContactToSheetMappingSchema)
      .min(1)
      .describe("Sheet columns and the values to write into them."),
  }),
  z.object({
    ...baseRunGoogleSheetSchema,
    action: z
      .literal(stepTypes.enum.spreadsheetClearRow)
      .describe("Clear the matching row."),
  }),
])
export type RunGoogleSheet = z.infer<typeof runGoogleSheet>

export const defaultFn = (): RunGoogleSheet => ({
  type: triggerActions.enum.runGoogleSheet,
  action: stepTypes.enum.spreadsheetGetRow,
  spreadsheetId: "",
  sheetName: "",
  lookup: {
    mode: FilterMode.AND,
    conditions: [],
  },
  map: [],
})
