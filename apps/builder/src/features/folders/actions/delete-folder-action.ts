"use server";

import {
  DeleteFolderBindSchema,
  deleteFolderBindSchema,
} from "@/features/folders/schemas/delete-folder-schema";
import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { Folder, prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";

export const deleteFolderAction = authActionClient
  .bindArgsSchemas(deleteFolderBindSchema)
  .action(async ({
    ctx,
    bindArgsParsedInputs: [chatbotId, id],
  }: {
    ctx: { user: User }
    bindArgsParsedInputs: DeleteFolderBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const folder: Folder = await prisma.folder.findFirstOrThrow({
      where: {
        id,
        chatbotId
      }
    })

    // TODO: move to trash

    // const trashFolder: Folder|null = await prisma.folder.findFirst({
    //   where: {
    //     chatbotId,
    //     folderType: folder.folderType,
    //     isTrash: true
    //   }
    // })

    // if (trashFolder && folder.parentId !== trashFolder.id) {
    //   await prisma.folder.update({
    //     where: { id },
    //     data: {
    //       parentId: trashFolder.parentId,
    //       paths
    //     }
    //    })
    // } else {
    await prisma.folder.deleteMany({
      where: {
        OR: [
          {
            id,
          },
          {
            paths: {
              has: folder.id
            }
          }
        ]
      }
    })

    revalidateTag(`${ctx.user.id}#folders#${folder.folderType}`)

    return {
      successful: true,
    }
  })
