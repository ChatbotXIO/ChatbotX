import { workspaceMemberPermissionsSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  inviteWorkspaceMemberRequest,
  updateWorkspaceMemberRequest,
} from "./mutation"
import { workspaceMemberResource } from "./resource"

export const workspaceMemberPublicResource = workspaceMemberResource.omit({
  workspaceId: true,
})

export const workspaceInvitationPublicResource = z.object({
  id: zodBigintAsString(),
  code: z.string(),
  permissions: workspaceMemberPermissionsSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const inviteWorkspaceMemberPublicRequest = inviteWorkspaceMemberRequest

export const updateWorkspaceMemberPublicRequest =
  updateWorkspaceMemberRequest.extend({
    memberId: zodBigintAsString(),
  })

export const removeWorkspaceMemberPublicRequest = z.object({
  memberId: zodBigintAsString(),
})
