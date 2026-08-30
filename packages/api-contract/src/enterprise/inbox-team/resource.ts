import {
  createSelectSchema,
  inboxTeamMemberModel,
  inboxTeamModel,
  userModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

const publicInboxTeamResource = createSelectSchema(inboxTeamModel, {
  id: z.string(),
  workspaceId: z.string(),
})

const publicInboxTeamMemberResource = createSelectSchema(inboxTeamMemberModel, {
  id: z.string(),
  inboxTeamId: z.string(),
})

const publicUserResource = createSelectSchema(userModel, { id: z.string() })

export const publicListInboxTeamsResponse = z.object({
  data: z.array(
    publicInboxTeamResource.extend({
      inboxTeamMembers: z.array(
        publicInboxTeamMemberResource.extend({
          user: publicUserResource,
        }),
      ),
    }),
  ),
})
export type PublicListInboxTeamsResponse = z.infer<
  typeof publicListInboxTeamsResponse
>
