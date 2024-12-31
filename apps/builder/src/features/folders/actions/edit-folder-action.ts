"use server";

import {
  EditFolderBindSchema,
  editFolderBindSchema,
  EditFolderSchema,
  editFolderSchema
} from "@/features/folders/schemas/edit-folder-schema";
import { authActionClient } from "@/lib/safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { Prisma, prisma, User } from "@ahachat.ai/database";
import { revalidateTag } from "next/cache";

export const editFolderAction = authActionClient
  .schema(editFolderSchema)
  .bindArgsSchemas(editFolderBindSchema)
  .action(async ({
    ctx,
    parsedInput,
    bindArgsParsedInputs: [chatbotId, folderId],
  }: {
    ctx: { user: User },
    parsedInput: EditFolderSchema,
    bindArgsParsedInputs: EditFolderBindSchema
  }) => {
    await findChatbotOrFail(ctx.user.id, chatbotId)

    const folder = await prisma.folder.findFirstOrThrow({
      where: {
        chatbotId: chatbotId,
        id: folderId
      }
    })

    const data: Prisma.FolderUpdateInput = {
      name: parsedInput.name
    }
    // if (parsedInput.parentId && parsedInput.parentId !== folder.parentId) {
    //   const parentFolder = await prisma.folder.findFirstOrThrow({
    //     where: {
    //       chatbotId: chatbotId,
    //       id: folderId,
    //       folderType: folder.folderType
    //     }
    //   })

    //   data.paths = [...parentFolder.paths, parentFolder.id]
    // }

    await prisma.folder.update({
      where: { id: folderId },
      data,
    })

    revalidateTag(`${ctx.user.id}#folders#${folder.folderType}`)

    return {
      successful: true,
    }
  })
