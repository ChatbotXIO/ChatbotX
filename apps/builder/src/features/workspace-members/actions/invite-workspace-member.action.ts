"use server"

import { db } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { randomString } from "remeda"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"

export const inviteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(inviteWorkspaceMemberRequest)
  .action(
    async ({ ctx, parsedInput, bindArgsParsedInputs: [workspaceId] }) =>
      await db
        .insert(invitationModel)
        .values({
          id: createId(),
          code: `${randomString()}${createId()}`,
          permissions: parsedInput.permissions,
          expiresAt: addDays(new Date(), 1),
          workspaceId,
          organizationId: ctx.workspace.organizationId,
          invitedBy: ctx.user.id,
        })
        .returning()
        .then((result) => result[0]),
  )
