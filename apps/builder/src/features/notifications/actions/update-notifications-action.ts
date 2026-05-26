"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { revalidatePath } from "next/cache"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateNotificationsSchema } from "../schema/update-notifications-schema"

export const updateMyNotificationsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateNotificationsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const workspaceMember = await findOrFail({
      table: workspaceMemberModel,
      where: {
        workspaceId: ctx.workspaceId,
        userId: ctx.user.id,
      },
      message: "Membro do workspace não encontrado",
    })

    await db
      .update(workspaceMemberModel)
      .set({
        notificationTypes: parsedInput.notificationTypes,
        notificationChannels: parsedInput.notificationChannels,
      })
      .where(eq(workspaceMemberModel.id, workspaceMember.id))

    revalidatePath("/space", "layout")
  })
