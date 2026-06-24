"use server"

import {
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import { createId, SymbolicSnowflakeIDs } from "@chatbotx.io/utils"
import { addDays } from "date-fns"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"

export const inviteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(inviteWorkspaceMemberRequest)
  .action(async ({ ctx, parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    // Read-only gate: the team-member quota is consumed when the invitation
    // is accepted (accept-invitation.ts), so block issuing a new invitation
    // once the workspace owner is already at the limit (own or reseller pool).
    const workspace = await workspaceService.findById({ id: workspaceId })
    const atLimit = await quotaEnforcementService.hasReachedLimit({
      userId: workspace.ownerId,
      metric: "teamMembers",
    })
    if (atLimit) {
      throw new ChatbotXException(
        "Team member limit reached for this workspace plan",
      )
    }

    return await db
      .insert(invitationModel)
      .values({
        id: createId(),
        code: SymbolicSnowflakeIDs.generate(),
        permissions: parsedInput.permissions,
        expiresAt: addDays(new Date(), 1),
        workspaceId,
        invitedBy: ctx.user.id,
      })
      .returning()
      .then((result) => result[0])
  })
