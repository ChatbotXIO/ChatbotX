import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

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
  id: z.string().cuid2(),
  spreadsheetId: z.string().cuid2(),
  sheetName: z.string().min(1),
})
export type SpreadSheetSchema = z.infer<typeof spreadsheetSchema>

export const spreadsheetDefaultFn = (): SpreadSheetSchema => ({
  id: createId(),
  spreadsheetId: "",
  sheetName: "",
})

export const spreadsheetMappingSchema = z.object({
  customFieldId: z.string().cuid2(),
  header: z.string().min(100),
})

export type SpreadsheetMappingSchema = z.infer<typeof spreadsheetMappingSchema>

export const spreadsheetMappingDefaultFn = (
  header: string,
): SpreadsheetMappingSchema => ({
  customFieldId: "",
  header,
})

export const spreadsheetColumnFilterSchema = z.object({
  mode: z.nativeEnum(FilterMode),
  conditions: z.array(
    z.object({
      column: z.string(),
      operator: z.nativeEnum(Operator),
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
