import {
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { inboxTeamResource } from "@/enterprise/features/inbox-teams/schema/resource"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { contactInboxResource } from "@/features/contact-inboxes/schema/resource"
import { contactOnSequenceWithRelations } from "@/features/contact-sequences/schema"
import { conversationResource } from "@/features/conversations/schema/resource"
import { inboxResource } from "@/features/inboxes/schema/resource"
import { tagResource } from "@/features/tags/schema/resource"
import { userResource } from "@/features/users/schema/resource"
import { basePaginationRequest } from "@/lib/pagination"
import {
  contactCustomFieldResource,
  publicContactCustomFieldResource,
} from "./contact-custom-field"
import { contactNoteResource } from "./contact-note"
import { contactResource } from "./resource"

/** Same as contact filter payload (strict discriminated `conditions`). */
export const contactFilterSchema = contactFilterCriteriaSchema

const parseContactFilterSearchParam = (value: unknown) => {
  if (typeof value !== "string") {
    return value
  }

  try {
    const parsed = contactFilterCriteriaSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : undefined
  } catch {
    return
  }
}

export type {
  ContactFilterCondition,
  ContactFilterCriteria,
  ContactFilterRequest,
} from "@/features/contact-filter/schema"
export {
  contactFilterRequest,
  singleContactFilterConditionSchema,
} from "@/features/contact-filter/schema"

export const listContactsRequest = basePaginationRequest.extend({
  keyword: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring match against the contact's name, email, or phone.",
    ),
  workspaceId: zodBigintAsString(),
  contactFilter: z.preprocess(
    parseContactFilterSearchParam,
    contactFilterCriteriaSchema
      .optional()
      .describe(
        "Structured filter for advanced matching beyond `keyword`. See `contacts.listFilterFields` for the field/operator reference.",
      ),
  ),
  channels: z
    .array(channelTypes)
    .optional()
    .describe(
      "Restrict to contacts with at least one inbox on one of these channels.",
    ),
  integrationWhatsappId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to contacts reachable via this WhatsApp integration id.",
    ),
  integrationMessengerId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to contacts reachable via this Messenger integration id.",
    ),
  inboxIds: z
    .array(zodBigintAsString())
    .optional()
    .describe(
      "Restrict to contacts with at least one conversation in one of these inbox ids.",
    ),
  subaction: broadcastSubactions
    .optional()
    .describe("Broadcast recipient sub-action filter."),
})
export type ListContactsRequest = z.infer<typeof listContactsRequest>

export const listContactInboxesAudiencePreviewRequest =
  listContactsRequest.extend({
    perPage: z.coerce.number().int().min(1).max(50).nullish(),
  })
export type ListContactInboxesAudiencePreviewRequest = z.infer<
  typeof listContactInboxesAudiencePreviewRequest
>

export const audiencePreviewContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
  occurredAt: z.string().nullable(),
  channel: channelTypes,
  conversationId: z.string().nullable(),
})

export const listContactInboxesAudiencePreviewResponse = z.object({
  data: z.array(audiencePreviewContactResource),
})

export const contactResponse = contactResource.and(
  z.object({
    contactCustomFields: z.array(contactCustomFieldResource).optional(),
    tags: z.array(tagResource).optional(),
    contactNotes: z.array(contactNoteResource).optional(),
    contactInboxes: z
      .array(contactInboxResource.extend({ inbox: inboxResource }))
      .optional(),
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
export type ContactResponse = z.infer<typeof contactResponse>

export const listContactsResponse = z.object({
  data: z.array(contactResponse),
  pageCount: z.number(),
  totalCount: z.number(),
  totalCountCapped: z.boolean(),
})
export type ListContactsResponse = z.infer<typeof listContactsResponse>

export const publicListContactsResponse = z.object({
  data: z.array(contactResponse),
})

export const findContactRequest = contactResource
  .pick({ id: true, workspaceId: true })
  .partial()
export type FindContactRequest = z.infer<typeof findContactRequest>

export const publicListContactsByCustomFieldRequest = z.object({
  customFieldId: z
    .string()
    .describe(
      "Custom field id (numeric string). Get it from `customFields.list`.",
    ),
  value: z
    .string()
    .describe("Custom field value to match, exact string comparison."),
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
