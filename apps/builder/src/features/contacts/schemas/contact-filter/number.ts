import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const numberOperators: OperatorType[] = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.lt,
  operatorTypes.enum.lte,
  operatorTypes.enum.gt,
  operatorTypes.enum.gte,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
]

export const numberFilter = <T extends string>(field: T) =>
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
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.lt),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.lte),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.gt),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.gte),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isBetween),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.notBetween),
      value: sampleStringSchema,
    }),
  ])
