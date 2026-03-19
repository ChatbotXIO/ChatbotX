import { z } from "zod"

export const contactCountsSchema = z.object({
  date: z.date(),
  count: z.number(),
})
export type ContactCountsSchema = z.infer<typeof contactCountsSchema>

export const getContactCountsResponseSchema = z.object({
  data: z.array(contactCountsSchema),
})
export type GetContactCountsResponseSchema = z.infer<
  typeof getContactCountsResponseSchema
>

export const getContactsCountResponseSchema = z.object({
  data: z.object({
    count: z.number(),
  }),
})
export type GetContactsCountResponseSchema = z.infer<
  typeof getContactsCountResponseSchema
>
