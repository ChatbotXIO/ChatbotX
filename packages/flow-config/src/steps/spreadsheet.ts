import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { isBotFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const Operator = {
  IS: "is",
  IS_NOT: "is_not",
  GTE: "gte",
  LTE: "lte",
  GT: "gt",
  LT: "lt",
  CONTAINS: "contains",
  NOT_CONTAINS: "not_contains",
  STARTS_WITH: "starts_with",
  ENDS_WITH: "ends_with",
} as const
export type Operator = (typeof Operator)[keyof typeof Operator]

export const FilterMode = {
  AND: "AND",
  OR: "OR",
} as const
export type FilterMode = (typeof FilterMode)[keyof typeof FilterMode]

export const spreadsheetSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z.union([
    z.literal(stepTypes.enum.spreadsheetGetRandomRow),
    z.literal(stepTypes.enum.spreadsheetGetRow),
    z.literal(stepTypes.enum.spreadsheetClearRow),
    z.literal(stepTypes.enum.spreadsheetSendData),
    z.literal(stepTypes.enum.spreadsheetUpdateRow),
  ]),
  spreadsheetId: zodBigintAsString(),
  sheetName: z.string().min(1),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type SpreadsheetSchema = z.infer<typeof spreadsheetSchema>

export const spreadsheetStepVersions = z.enum(["v1", "v2"])
export type SpreadsheetStepVersion = z.infer<typeof spreadsheetStepVersions>

export const toSpreadsheetStepVersion = (
  value: unknown,
): SpreadsheetStepVersion =>
  spreadsheetStepVersions.catch(spreadsheetStepVersions.enum.v1).parse(value)

export const spreadsheetDefaultFn = (): SpreadsheetSchema => ({
  id: createId(),
  stepType: stepTypes.enum.spreadsheetGetRow,
  spreadsheetId: "",
  sheetName: "",
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})

/**
 * Accepts a `ContactCustomField` numeric id, a `bot_field:<id>` reference
 * token (Account Fields), or "" (clearable / legacy unset). Mirrors the
 * `zodFieldReference()` contract used by other save-target step fields, but
 * stays anchored to a numeric id (not a name) to preserve this schema's
 * existing strictness.
 */
const optionalCustomFieldIdSchema = z.union([
  zodBigintAsString(),
  z.string().refine(isBotFieldReference, {
    message: "Must be a valid bot field reference",
  }),
  z.literal(""),
])

export const spreadsheetSheetToContactMappingSchema = z.object({
  customFieldId: optionalCustomFieldIdSchema.describe(
    "Id of the contact custom field (from `customFields.list`) that receives the sheet value.",
  ),
  header: z
    .string()
    .min(1)
    .describe("Sheet column header whose value is read into the custom field."),
})

export type SpreadsheetSheetToContactMappingSchema = z.infer<
  typeof spreadsheetSheetToContactMappingSchema
>

export const spreadsheetSheetToContactMappingDefaultFn = (
  header: string,
): SpreadsheetSheetToContactMappingSchema => ({
  customFieldId: "",
  header,
})

export const spreadsheetContactToSheetMappingSchema = z.object({
  header: z
    .string()
    .min(1)
    .describe("Sheet column header that receives the value."),
  // Legacy v1 entries persisted `customFieldId: ""`; accept it (and undefined)
  // so existing steps validate. v2 uses `value`, not `customFieldId`.
  customFieldId: optionalCustomFieldIdSchema
    .optional()
    .describe(
      'Legacy v1 field. With `version: "v2"` leave it unset and use `value`; under v1 (the default when `version` is omitted) `value` is ignored.',
    ),
  value: z
    .string()
    .default("")
    .describe(
      "Value written to the column. May include `{{variable}}` placeholders such as contact fields.",
    ),
})

export type SpreadsheetContactToSheetMappingSchema = z.infer<
  typeof spreadsheetContactToSheetMappingSchema
>

export const spreadsheetContactToSheetMappingDefaultFn = (
  header: string,
): SpreadsheetContactToSheetMappingSchema => ({
  header,
  value: "",
})

export const spreadsheetColumnFilterSchema = z.object({
  mode: z
    .enum(FilterMode)
    .describe("`AND` requires every condition to match a row; `OR` any one."),
  conditions: z
    .array(
      z.object({
        column: z.string().describe("Sheet column header to test."),
        operator: z
          .enum(Operator)
          .describe(
            "Comparison: is, is_not, gte, lte, gt, lt, contains, not_contains, starts_with or ends_with.",
          ),
        value: z
          .string()
          .describe(
            "Value to compare the column against. May include `{{variable}}` placeholders.",
          ),
      }),
    )
    .describe("Row-matching conditions that select the sheet row."),
})

export type SpreadsheetColumnFilterSchema = z.infer<
  typeof spreadsheetColumnFilterSchema
>

export const spreadsheetColumnFilterDefaultFn =
  (): SpreadsheetColumnFilterSchema => ({
    mode: FilterMode.AND,
    conditions: [],
  })
