import { workspaceMemberPermissionsSchema } from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  userModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { basePaginationInput } from "../shared/pagination"

const publicWorkspaceMemberResource = createSelectSchema(workspaceMemberModel, {
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
}).extend({
  permissions: workspaceMemberPermissionsSchema,
})

const publicUserResource = createSelectSchema(userModel, { id: z.string() })

export const listWorkspaceMembersInput = basePaginationInput.extend({
  keyword: z.string().nullish().default(null),
})
export type ListWorkspaceMembersInput = z.infer<
  typeof listWorkspaceMembersInput
>

export const publicListWorkspaceMembersResponse = z.object({
  data: z.array(
    publicWorkspaceMemberResource.extend({
      user: publicUserResource.pick({ id: true, name: true, image: true }),
    }),
  ),
  pageCount: z.number(),
})
export type PublicListWorkspaceMembersResponse = z.infer<
  typeof publicListWorkspaceMembersResponse
>

export const getWorkspaceMemberInput = z.object({
  memberId: zodBigintAsString(),
})
export type GetWorkspaceMemberInput = z.infer<typeof getWorkspaceMemberInput>

export const publicGetWorkspaceMemberResponse =
  publicWorkspaceMemberResource.extend({
    user: publicUserResource.pick({ id: true, name: true, image: true }),
  })
export type PublicGetWorkspaceMemberResponse = z.infer<
  typeof publicGetWorkspaceMemberResponse
>
