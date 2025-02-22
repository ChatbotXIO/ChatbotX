import {
  FilterAttribute,
  FilterOperator,
} from "@/features/contacts/filter-type"
import { z } from "zod"

export const interactedLast24hSchema = z.object({
  attribute: z.literal(FilterAttribute.InteractedLast24h),
  operator: z.enum([FilterOperator.Is]),
  value: z.boolean(),
})

export type InteractedLast24hSchema = z.infer<typeof interactedLast24hSchema>
