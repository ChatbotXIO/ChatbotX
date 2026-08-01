import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
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
  id: zodBigintAsString(),
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

const optionalCustomFieldIdSchema = z.union([
  zodBigintAsString(),
  z.literal(""),
])

export const spreadsheetSheetToContactMappingSchema = z.object({
  customFieldId: optionalCustomFieldIdSchema,
  header: z.string().min(1),
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
  header: z.string().min(1),
  // Legacy v1 entries persisted `customFieldId: ""`; accept it (and undefined)
  // so existing steps validate. v2 uses `value`, not `customFieldId`.
  customFieldId: optionalCustomFieldIdSchema.optional(),
  value: z.string().default(""),
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
  mode: z.enum(FilterMode),
  conditions: z.array(
    z.object({
      column: z.string(),
      operator: z.enum(Operator),
      value: z.string(),
    }),
  ),
})

export type SpreadsheetColumnFilterSchema = z.infer<
  typeof spreadsheetColumnFilterSchema
>

export const spreadsheetColumnFilterDefaultFn =
  (): SpreadsheetColumnFilterSchema => ({
    mode: FilterMode.AND,
    conditions: [],
  })
