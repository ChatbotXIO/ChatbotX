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

export const spreadsheetDefaultFn = (): SpreadsheetSchema => ({
  id: createId(),
  stepType: stepTypes.enum.spreadsheetGetRow,
  spreadsheetId: "",
  sheetName: "",
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})

export const spreadsheetMappingSchema = z.object({
  customFieldId: zodBigintAsString(),
  header: z.string().min(1),
})

export type SpreadsheetMappingSchema = z.infer<typeof spreadsheetMappingSchema>

export const spreadsheetMappingDefaultFn = (
  header: string,
): SpreadsheetMappingSchema => ({
  customFieldId: "",
  header,
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
