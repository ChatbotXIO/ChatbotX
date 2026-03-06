import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  conversationModel,
  createSelectSchema,
  inboxModel,
  inboxTeamModel,
  tagModel,
  userModel,
} from "@aha.chat/database/schema"
import type { CustomFieldType } from "@aha.chat/database/types"
import type { LucideIcon } from "lucide-react"
import { z } from "zod"
import { BaseException } from "@/lib/errors/exception"

export class ContactException extends BaseException {}

export const contactResource = z.intersection(
  createSelectSchema(contactModel),
  z.object({
    contactCustomFields: z
      .array(createSelectSchema(contactCustomFieldModel))
      .optional(),
    tags: z.array(createSelectSchema(tagModel)).optional(),
    contactNotes: z.array(createSelectSchema(contactNoteModel)).optional(),
    conversation: z
      .intersection(
        createSelectSchema(conversationModel),
        z.object({
          assignedUser: createSelectSchema(userModel).nullable().optional(),
          assignedInboxTeam: createSelectSchema(inboxTeamModel)
            .nullable()
            .optional(),
          inbox: createSelectSchema(inboxModel).nullable().optional(),
        }),
      )
      .nullable()
      .optional(),
  }),
)
export type ContactResource = z.infer<typeof contactResource>

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  customFieldType: CustomFieldType
}
