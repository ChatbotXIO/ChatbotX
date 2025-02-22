import { interactedLast24hSchema } from "@/features/contacts/filter/conditions/24h/schema"
import { z } from "zod"

export enum QueryMatchEnum {
  AND = "AND",
  OR = "OR",
}

export const filterContactSchema = z
  .object({
    match: z.nativeEnum(QueryMatchEnum),
    conditions: z.array(z.union([interactedLast24hSchema])),
  })
  .nullable()
  .optional()
export type FilterContactSchema = z.infer<typeof filterContactSchema>
