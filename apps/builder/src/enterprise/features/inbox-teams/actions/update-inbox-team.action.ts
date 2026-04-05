"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxTeamModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateInboxTeamRequest,
  updateInboxTeamRequest,
} from "../schema/action"

export const updateInboxTeamAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateInboxTeamRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, inboxTeamId],
      parsedInput,
    } = props

    return await updateInboxTeam({ workspaceId, inboxTeamId }, parsedInput)
  })

export const updateInboxTeam = async (
  ctx: { workspaceId: string; inboxTeamId: string },
  parsedInput: UpdateInboxTeamRequest,
) => {
  const inboxTeam = await findOrFail({
    table: inboxTeamModel,
    where: {
      id: ctx.inboxTeamId,
      workspaceId: ctx.workspaceId,
    },
    message: "Inbox team not found",
  })

  await db
    .update(inboxTeamModel)
    .set(parsedInput)
    .where(eq(inboxTeamModel.id, inboxTeam.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#inboxTeams`)
}
