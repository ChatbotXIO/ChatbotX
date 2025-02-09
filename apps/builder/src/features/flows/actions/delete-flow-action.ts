"use server"

import { FolderException } from "@/features/folders/schemas/exception"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type Folder,
  FolderType,
  type User,
  prisma,
} from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type DeleteFlowBindSchema,
  deleteFlowBindSchema,
} from "../schemas/delete-flow-schema"

export const deleteFlowAction = authActionClient
  .bindArgsSchemas(deleteFlowBindSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, ids],
    }: {
      ctx: { user: User }
      bindArgsParsedInputs: DeleteFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      const trashedFolder: Folder | null = await prisma.folder.findFirst({
        where: {
          chatbotId,
          folderType: FolderType.Flow,
          isTrash: true,
        },
      })
      if (!trashedFolder) {
        throw new FolderException("Trashed Folder does not exists.")
      }

      await prisma.flow.updateMany({
        where: {
          id: {
            in: ids,
          },
          chatbotId,
        },
        data: {
          folderId: trashedFolder.id,
        },
      })

      revalidateTag(`${chatbotId}#flows`)

      return {
        successful: true,
      }
    },
  )
