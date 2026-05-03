import { operatorTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

export const selectFilter = <T extends string>(field: T) =>
  z.discriminatedUnion("operator", [
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.hasAnyOf),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.hasNoneOf),
      value: sampleStringSchema,
    }),
    z.object({
      field: z.literal(field),
      operator: z.literal(operatorTypes.enum.isEmpty),
    }),
  ])
