import { db } from "@aha.chat/database/client"
import type {
  FindContactRequest,
  PublicFindContactResponse,
  PublicListContactsByCustomFieldRequest,
  PublicListContactsResponse,
} from "../schemas/query"

export const publicFindContact = async (
  input: FindContactRequest,
): Promise<PublicFindContactResponse | undefined> => {
  return await db.query.contactModel.findFirst({
    where: input,
    with: {
      tags: true,
      customFields: true,
    },
  })
}

export const publicListContactsByCustomField = async (
  input: PublicListContactsByCustomFieldRequest & { chatbotId: string },
): Promise<PublicListContactsResponse> => {
  const { chatbotId, customFieldId, value } = input

  const where: Record<string, unknown> = {
    chatbotId,
  }
  if (customFieldId === "email") {
    where.email = value
  } else if (customFieldId === "phone") {
    where.phone = value
  } else {
    where.contactCustomFields = {
      id: customFieldId,
      value,
    }
  }

  const data = await db.query.contactModel.findMany({
    where,
    limit: 100,
    orderBy: {
      updatedAt: "desc",
    },
    with: {
      tags: true,
      customFields: true,
    },
  })

  return { data }
}
