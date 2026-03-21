import {
  createSelectSchema,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import type {
  InboxTeamMemberModel,
  InboxTeamModel,
} from "@chatbotx.io/database/types"
import { z } from "zod"
import type { UserResource } from "@/features/users/schemas/resource"

export const inboxTeamResource = createSelectSchema(inboxTeamModel)

export type InboxTeamResource = InboxTeamModel & {
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamMemberResource = InboxTeamMemberModel & {
  user?: UserResource | null
}

export const createInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255),
  userIds: z.array(z.cuid2()),
})
export type CreateInboxTeamRequest = z.infer<typeof createInboxTeamRequest>

export const updateInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255).optional(),
})
export type UpdateInboxTeamRequest = z.infer<typeof updateInboxTeamRequest>

export const addInboxTeamMemberRequest = z.object({
  userIds: z.array(z.cuid2()),
})
export type AddInboxTeamMemberRequest = z.infer<
  typeof addInboxTeamMemberRequest
>

export type ListInboxTeamsRequest = {
  chatbotId: string
}
