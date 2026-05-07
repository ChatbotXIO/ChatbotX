import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const booleanOperators: OperatorType[] = [
  operatorTypes.enum.eq,
  operatorTypes.enum.isEmpty,
]

export const booleanFilter = <T extends string>(field: T) =>
  z.discriminatedUnion("operator", [
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.eq),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
  ])
