import { notFoundException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type {
  ContactResponse,
  FindContactRequest,
  PublicListContactsByCustomFieldRequest,
} from "../schemas/query"

const NUMERIC_RE = /^\d+$/

export async function resolveContactId({
  identifier,
  workspaceId,
}: {
  identifier: string
  workspaceId: string
}): Promise<string> {
  const colonIdx = identifier.indexOf(":")
  if (colonIdx === -1) {
    throw notFoundException("Invalid identifier format")
  }

  const prefix = identifier.slice(0, colonIdx)
  const value = identifier.slice(colonIdx + 1)
  if (!value) {
    throw notFoundException("Invalid identifier format")
  }

  const whereClause: Record<string, unknown> = { workspaceId }

  if (prefix === "id") {
    if (!NUMERIC_RE.test(value)) {
      throw notFoundException("Contact not found")
    }
    whereClause.id = value
  } else if (prefix === "email") {
    whereClause.email = value
  } else if (prefix === "phone") {
    whereClause.phoneNumber = value
  } else {
    throw notFoundException(
      "Invalid identifier format. Use id:, email:, or phone: prefix",
    )
  }

  const contact = await db.query.contactModel.findFirst({
    where: whereClause,
    columns: { id: true },
  })

  if (!contact) {
    throw notFoundException("Contact not found")
  }
  return contact.id
}

export async function tryResolveContactId(params: {
  identifier: string
  workspaceId: string
}): Promise<string | null> {
  try {
    return await resolveContactId(params)
  } catch {
    return null
  }
}

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
      customFieldId,
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
