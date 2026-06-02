import { db } from "@chatbotx.io/database/client"
import type {
  ContactResponse,
  FindContactRequest,
  PublicListContactsByCustomFieldRequest,
} from "../schemas/query"

export const publicFindContact = async (
  input: FindContactRequest,
): Promise<ContactResponse | undefined> =>
  await db.query.contactModel.findFirst({
    where: input,
    with: {
      tags: true,
      contactCustomFields: true,
      contactInboxes: {
        with: {
          inbox: true,
        },
      },
      conversation: {
        with: {
          assignedUser: true,
          assignedInboxTeam: true,
        },
      },
    },
  })

export const publicListContactsByCustomField = async (
  input: PublicListContactsByCustomFieldRequest & { workspaceId: string },
): Promise<{ data: ContactResponse[] }> => {
  const { workspaceId, customFieldId, value } = input

  const where: Record<string, unknown> = {
    workspaceId,
  }
  if (customFieldId === "email") {
    where.email = value
  } else if (customFieldId === "phone") {
    where.phoneNumber = value
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
      contactCustomFields: true,
      contactInboxes: {
        with: {
          inbox: true,
        },
      },
      conversation: {
        with: {
          assignedUser: true,
          assignedInboxTeam: true,
        },
      },
    },
  })

  return { data }
}
