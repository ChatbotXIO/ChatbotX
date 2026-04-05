import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { userResource } from "@/features/users/schemas/resource"
import { inboxTeamMemberResource } from "../../inbox-team-members/schema/resource"
import { inboxTeamResource } from "./resource"

export const createInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255),
  userIds: z.array(zodBigintAsString()),
})
export type CreateInboxTeamRequest = z.infer<typeof createInboxTeamRequest>

export const updateInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255).optional(),
})
export type UpdateInboxTeamRequest = z.infer<typeof updateInboxTeamRequest>

export const addInboxTeamMemberRequest = z.object({
  userIds: z.array(zodBigintAsString()),
})
export type AddInboxTeamMemberRequest = z.infer<
  typeof addInboxTeamMemberRequest
>

export const listInboxTeamsRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListInboxTeamsRequest = z.infer<typeof listInboxTeamsRequest>

export const listInboxTeamsResponse = z.object({
  data: z.array(
    inboxTeamResource.extend({
      inboxTeamMembers: z.array(
        inboxTeamMemberResource.extend({
          user: userResource,
        }),
      ),
    }),
  ),
})
export type ListInboxTeamsResponse = z.infer<typeof listInboxTeamsResponse>
