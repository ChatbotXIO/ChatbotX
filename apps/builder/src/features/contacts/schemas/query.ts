import { Operator } from "@aha.chat/database/enums"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination-server"
import { contactResource } from "./resource"

export const listContactsRequest = basePaginationRequest.and(
  z.object({
    keyword: z.string().optional(),
  }),
)
export type ListContactsRequest = z.infer<typeof listContactsRequest>

export const listContactsResponse = z.object({
  data: z.array(contactResource),
  pageCount: z.number(),
})
export type ListContactsResponse = z.infer<typeof listContactsResponse>

export const contactFilterRequest = z.object({
  contactFilter: z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(
      z.object({
        field: z.string().trim(),
        operator: z.enum(Operator),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    ),
  }),
})
export type ContactFilterRequest = z.infer<typeof contactFilterRequest>
