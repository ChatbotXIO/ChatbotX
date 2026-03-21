import { Operator } from "@aha.chat/database/enums"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema"
import { conversationResource } from "@/features/conversations/schemas/resource"
import { publicCustomFieldResource } from "@/features/custom-fields/schemas/resource"
import { inboxResource } from "@/features/inboxes/schemas/resource"
import {
  publicTagResource,
  tagResource,
} from "@/features/tags/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"
import { basePaginationRequest } from "@/lib/pagination"
import { contactCustomFieldResource } from "./contact-custom-field"
import { contactNoteResource } from "./contact-note"
import { contactResource, publicContactResource } from "./resource"

export const listContactsRequest = basePaginationRequest.and(
  z.object({
    keyword: z.string().optional(),
  }),
)
export type ListContactsRequest = z.infer<typeof listContactsRequest>

export const listContactsItem = contactResource.and(
  z.object({
    contactCustomFields: z.array(contactCustomFieldResource).optional(),
    tags: z.array(tagResource).optional(),
    contactNotes: z.array(contactNoteResource).optional(),
    conversation: conversationResource
      .and(
        z.object({
          assignedUser: userResource.nullish(),
          assignedInboxTeam: inboxTeamResource.nullish(),
          inbox: inboxResource.nullish(),
        }),
      )
      .nullable()
      .optional(),
  }),
)
export type ListContactsItem = z.infer<typeof listContactsItem>

export const listContactsResponse = z.object({
  data: z.array(listContactsItem),
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

export const findContactRequest = contactResource
  .pick({ id: true, chatbotId: true })
  .partial()
export type FindContactRequest = z.infer<typeof findContactRequest>

export const publicFindContactResponse = publicContactResource.and(
  z.object({
    tags: z.array(publicTagResource),
    customFields: z.array(publicCustomFieldResource),
  }),
)
export type PublicFindContactResponse = z.infer<
  typeof publicFindContactResponse
>

export const publicListContactsResponse = z.object({
  data: z.array(publicFindContactResponse),
})
export type PublicListContactsResponse = z.infer<
  typeof publicListContactsResponse
>

export const publicListContactsByCustomFieldRequest = z.object({
  customFieldId: z.string(),
  value: z.string(),
})

export type PublicListContactsByCustomFieldRequest = z.infer<
  typeof publicListContactsByCustomFieldRequest
>
