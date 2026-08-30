import { z } from "zod"

const localDateTimeSchema = z.iso.datetime({ local: true })

export const submitAvailabilityRangeRequestSchema = z.union([
  z.object({
    token: z.string().min(1),
    skip: z.literal(true),
  }),
  z
    .object({
      token: z.string().min(1),
      skip: z.literal(false).optional(),
      startDate: localDateTimeSchema,
      endDate: localDateTimeSchema,
    })
    .refine((value) => value.startDate <= value.endDate, {
      path: ["endDate"],
    }),
])

export type SubmitAvailabilityRangeInput = z.infer<
  typeof submitAvailabilityRangeRequestSchema
>
