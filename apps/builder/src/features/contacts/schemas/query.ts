import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema/resource"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"
import { contactNoteResource } from "@/features/contact-notes/schemas/resource"
import { contactOnSequenceWithRelations } from "@/features/contact-sequences/schema"
import { conversationResource } from "@/features/conversations/schema/resource"
import { publicCustomFieldResource } from "@/features/custom-fields/schemas/resource"
import { inboxResource } from "@/features/inboxes/schema/resource"
import { publicTagResource, tagResource } from "@/features/tags/schema/resource"
import { userResource } from "@/features/users/schemas/resource"
import { basePaginationRequest } from "@/lib/pagination"
import {
  contactCustomFieldResource,
  publicContactCustomFieldResource,
} from "./contact-custom-field"
import { contactFilterCriteriaSchema } from "./contact-filter"
import { contactResource, publicContactResource } from "./resource"

/** Same as contact filter payload (strict discriminated `conditions`). */
export const contactFilterSchema = contactFilterCriteriaSchema

export type {
  ContactFilterCondition,
  ContactFilterCriteria,
  ContactFilterRequest,
} from "./contact-filter"
export {
  contactFilterRequest,
  singleContactFilterConditionSchema,
} from "./contact-filter"

export const listContactsRequest = basePaginationRequest.extend({
  keyword: z.string().optional(),
  workspaceId: zodBigintAsString(),
  contactFilter: contactFilterCriteriaSchema.optional(),
  channels: z.array(channelTypes).optional(),
  inboxIds: z.array(zodBigintAsString()).optional(),
})
export type ListContactsRequest = z.infer<typeof listContactsRequest>

export const listContactsItem = contactResource.and(
  z.object({
    contactCustomFields: z.array(contactCustomFieldResource).optional(),
    tags: z.array(tagResource).optional(),
    contactNotes: z.array(contactNoteResource).optional(),
    contactInboxes: z.array(contactInboxResource).optional(),
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

export const findContactRequest = contactResource
  .pick({ id: true, workspaceId: true })
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

export const getContactRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
})
export type GetContactRequest = z.infer<typeof getContactRequest>

export const getContactResponse = contactResource.and(
  z.object({
    tags: z.array(tagResource),
    customFields: z.array(publicContactCustomFieldResource),
    contactNotes: z.array(contactNoteResource),
    contactsOnSequences: z.array(contactOnSequenceWithRelations),
  }),
)
export type GetContactResponse = z.infer<typeof getContactResponse>
