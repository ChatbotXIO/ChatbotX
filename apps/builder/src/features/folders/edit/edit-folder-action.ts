"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { toast } from "sonner";
import { returnValidationErrors } from "next-safe-action";
import { EditFolderSchema, editFolderSchema } from "@/features/folders/edit/edit-folder-schema";

export const editFolderAction = authActionClient
  .schema(editFolderSchema)
  .action(async ({ parsedInput }: { parsedInput: EditFolderSchema }) => {
    const existedFolderId = await prisma.folder.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        id: parsedInput.folderId
      }
    })
    if (!existedFolderId) {
      toast(`Folder ${parsedInput.name} is not existed!`)
    }
    const existedFolderName = await prisma.folder.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        name: parsedInput.name,
        group: existedFolderId?.group,
        id: {
          not: parsedInput.folderId
        }
      }
    })
    if (existedFolderName) {
      return returnValidationErrors(editFolderSchema, {
        _errors: ["Validation Exception"],
        name: {
          _errors: [`Folder ${parsedInput.name} is existed!`]
        }
      });
    }

    await prisma.folder.update({ where: { id: parsedInput.folderId }, data: { name: parsedInput.name } })

    return {
      successful: true,
    }
  })
