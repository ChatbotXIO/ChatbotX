import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const textOperators: OperatorType[] = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
]

export const textFilter = <T extends string>(field: T) =>
  z.discriminatedUnion("operator", [
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.eq),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.ne),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isNotEmpty),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.contains),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.notContains),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.startsWith),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.endsWith),
      value: sampleStringSchema,
    }),
  ])
