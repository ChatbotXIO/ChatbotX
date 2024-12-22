"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import {
  DeleteFolderBindSchema,
  deleteFolderBindSchema,
} from "@/features/folders/delete/delete-folder-schema";

export const deleteFolderAction = authActionClient
  .bindArgsSchemas(deleteFolderBindSchema)
  .action(async ({
    bindArgsParsedInputs: [chatbotId, folderId],
  }: {
    bindArgsParsedInputs: DeleteFolderBindSchema
  }) => {
    const where = {
      chatbotId: chatbotId,
      id: folderId
    }
    const existedFolder = await prisma.folder.findFirst({ where })
    console.log('existedFolder', existedFolder, where)
    if (!existedFolder) {
      throw new Error(`Folder ${folderId} is not existed!`)
    }

    await prisma.folder.delete({ where })

    return {
      successful: true,
    }
  })
