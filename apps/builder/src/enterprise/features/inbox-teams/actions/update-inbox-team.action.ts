"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateInboxTeamRequest } from "../schema/action"

export const updateInboxTeamAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateInboxTeamRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, inboxTeamId],
      ctx: { user },
      parsedInput,
    } = props

    const inboxTeam = await findOrFail({
      table: inboxTeamModel,
      where: {
        id: inboxTeamId,
        workspaceId,
      },
      message: "Inbox team not found",
    })

    await db.transaction(async (tx) => {
      const patch: { name?: string; description?: string | null } = {}
      if (parsedInput.name !== undefined) {
        patch.name = parsedInput.name
      }
      if (parsedInput.description !== undefined) {
        patch.description = parsedInput.description
      }

      if (Object.keys(patch).length > 0) {
        await tx
          .update(inboxTeamModel)
          .set(patch)
          .where(eq(inboxTeamModel.id, inboxTeam.id))
      }

      if (parsedInput.userIds !== undefined) {
        const existing = await tx.query.inboxTeamMemberModel.findMany({
          where: { inboxTeamId: inboxTeam.id },
          columns: { id: true, userId: true },
        })
        const desired = new Set(parsedInput.userIds)
        const existingByUser = new Map(existing.map((m) => [m.userId, m.id]))

        const toRemoveIds = existing
          .filter((m) => !desired.has(m.userId))
          .map((m) => m.id)
        const toAddUserIds = parsedInput.userIds.filter(
          (uid) => !existingByUser.has(uid),
        )

        if (toRemoveIds.length > 0) {
          await tx
            .delete(inboxTeamMemberModel)
            .where(
              and(
                eq(inboxTeamMemberModel.inboxTeamId, inboxTeam.id),
                inArray(inboxTeamMemberModel.id, toRemoveIds),
              ),
            )
        }
        if (toAddUserIds.length > 0) {
          await tx.insert(inboxTeamMemberModel).values(
            toAddUserIds.map((uid) => ({
              id: createId(),
              userId: uid,
              inboxTeamId: inboxTeam.id,
            })),
          )
        }
      }
    })

    const changes: string[] = []
    if (parsedInput.name !== undefined && parsedInput.name !== inboxTeam.name) {
      changes.push(`nome: "${inboxTeam.name}" → "${parsedInput.name}"`)
    }
    if (parsedInput.description !== undefined) {
      changes.push("descrição")
    }
    if (parsedInput.userIds !== undefined) {
      changes.push("membros")
    }

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.TEAM_UPDATED,
      detail: `Equipe "${parsedInput.name ?? inboxTeam.name}" atualizada${
        changes.length ? ` (${changes.join(", ")})` : ""
      }`,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
