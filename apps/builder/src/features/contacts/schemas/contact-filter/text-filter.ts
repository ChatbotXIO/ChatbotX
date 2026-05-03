import { operatorTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const textFilter = <T extends string>(field: T) =>
  z.discriminatedUnion("operator", [
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
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isNotEmpty),
    }),
  ])
