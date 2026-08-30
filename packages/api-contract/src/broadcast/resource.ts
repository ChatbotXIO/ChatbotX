import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicBroadcastResource = createSelectSchema(broadcastModel).pick({
  id: true,
  name: true,
  status: true,
  schedulesType: true,
  schedulesAt: true,
  flowId: true,
  contactCount: true,
})
export type PublicBroadcastResource = z.infer<typeof publicBroadcastResource>

export const publicListBroadcastsResponse = z.object({
  data: z.array(publicBroadcastResource),
})
export type PublicListBroadcastsResponse = z.infer<
  typeof publicListBroadcastsResponse
>

const broadcastAudienceContactResource = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  avatar: z.string().nullable(),
  gender: z.string().nullable(),
})

const broadcastAudienceItemResource = z.object({
  contactId: z.string(),
  contact: broadcastAudienceContactResource,
  sent: z.boolean(),
})

export const listBroadcastAudienceInput = z.object({
  idOrName: z.string(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).optional(),
})
export type ListBroadcastAudienceInput = z.infer<
  typeof listBroadcastAudienceInput
>

export const publicListBroadcastAudienceResponse = z.object({
  data: z.array(broadcastAudienceItemResource),
  pageCount: z.number(),
})
export type PublicListBroadcastAudienceResponse = z.infer<
  typeof publicListBroadcastAudienceResponse
>
