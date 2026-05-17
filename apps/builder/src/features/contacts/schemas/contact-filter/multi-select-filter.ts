import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const multiSelectOperators: OperatorType[] = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.isEmpty,
]

export const multiSelectFilter = <T extends string>(field: T) =>
  z.discriminatedUnion("operator", [
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.in),
      value: z.array(sampleStringSchema),
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.notIn),
      value: z.array(sampleStringSchema),
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
  ])
