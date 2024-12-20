"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { toast } from "sonner";
import { DeleteFolderSchema, deleteFolderSchema } from "@/features/folders/delete/delete-folder-schema";

export const deleteFolderAction = authActionClient
  .schema(deleteFolderSchema)
  .action(async ({ parsedInput }: { parsedInput: DeleteFolderSchema }) => {
    const where = {
      chatbotId: parsedInput.chatbotId,
      id: parsedInput.folderId
    }
    const existedFolder = await prisma.folder.findFirst({ where })
    if (!existedFolder) {
      toast(`Folder ${parsedInput.folderId} is not existed!`)
    }

    await prisma.folder.delete({ where })

    return {
      successful: true,
    }
  })
