"use server"

import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { FolderType, type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateAccountFieldSchema,
  type CreateCustomFieldSchema,
  type CreateFieldBindSchema,
  createAccountFieldSchema,
  createCustomFieldSchema,
  createFieldBindSchema,
} from "../schemas/create-field-schema"
import { FieldException } from "../schemas/exception"

const createField = async ({
  ctx,
  parsedInput,
  bindArgsParsedInputs: [chatbotId, folderId, fieldType],
}: {
  ctx: { user: User }
  parsedInput: CreateCustomFieldSchema | CreateAccountFieldSchema
  bindArgsParsedInputs: CreateFieldBindSchema
}) => {
  await findChatbotOrFail(ctx.user.id, chatbotId)

  const existingField = await prisma.field.findFirst({
    where: {
      name: parsedInput.name,
      chatbotId,
      fieldType,
    },
  })
  if (existingField) {
    throw new FieldException(
      `Custom field with the name "${parsedInput.name}" already exists.`,
    )
  }

  if (folderId) {
    await ensureFolderIdIsExists(folderId, chatbotId, FolderType.CUSTOM_FIELD)
  }

  await prisma.field.create({
    data: {
      chatbotId,
      folderId,
      fieldType,
      showInInbox: true,
      ...parsedInput,
    },
  })

  revalidateTag(`${ctx.user.id}#fields#${fieldType}`)

  return {
    successful: true,
  }
}

export const createCustomFieldAction = authActionClient
  .schema(createCustomFieldSchema)
  .bindArgsSchemas(createFieldBindSchema)
  .action(createField)

export const createAccountFieldAction = authActionClient
  .schema(createAccountFieldSchema)
  .bindArgsSchemas(createFieldBindSchema)
  .action(createField)
