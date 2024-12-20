"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma } from "@ahachat.ai/database";
import { returnValidationErrors } from "next-safe-action";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { User } from "@prisma/client";
import { CreateFolderSchema, createFolderSchema } from "@/features/folders/create/create-folder-schema";

export const createFolderAction = authActionClient
  .schema(createFolderSchema)
  .action(async ({ ctx, parsedInput }: { ctx: { user: User }, parsedInput: CreateFolderSchema }) => {
    await findChatbotOrFail(ctx.user.id, parsedInput.chatbotId)

    const existedFolder = await prisma.folder.findFirst({ where: { name: parsedInput.name } })
    if (existedFolder) {
      return returnValidationErrors(createFolderSchema, {
        _errors: ["Validation Exception"],
        name: {
          _errors: [`Folder ${parsedInput.name} is existed!`]
        }
      });
    }

    if (parsedInput.parentId) {
      const existedFolder = await prisma.folder.findFirst({ where: { id: parsedInput.parentId } })
      if (!existedFolder) {
        return returnValidationErrors(createFolderSchema, {
          _errors: ["Validation Exception"],
          parentId: {
            _errors: ["Parent folder ID not exists!"]
          }
        });
      }
    }

    await prisma.folder.create({ data: parsedInput })

    return {
      successful: true,
    }
  })
