import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { organizationMemberModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import { findOrganizationByDomain } from "@/features/organization/queries"
import { notFoundException } from "@/lib/errors/exception"
import type {
  ListOrganizationMembersRequest,
  ListOrganizationMembersResponse,
} from "../schema"

export const listOrganizationMembersRSC = async (
  input: ListOrganizationMembersRequest,
): Promise<ListOrganizationMembersResponse> => {
  const organization = await findOrganizationByDomain()
  if (!organization) {
    throw notFoundException("Organization not found")
  }

  return await listOrganizationMembers({
    ...input,
    organizationId: organization.id,
  })
}

export const listOrganizationMembers = async (
  input: ListOrganizationMembersRequest & { organizationId: string },
): Promise<ListOrganizationMembersResponse> => {
  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(organizationMemberModel, input)

  const where = {
    organizationId: input.organizationId,
    user: input.keyword
      ? {
          name: {
            ilike: `%${input.keyword.toLowerCase()}%`,
          },
        }
      : undefined,
  }

  const [data, totalRows] = await Promise.all([
    db.query.organizationMemberModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        user: true,
      },
    }),
    db.$count(
      organizationMemberModel,
      relationsFilterToSQL(organizationMemberModel, where),
    ),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount, ...pagination }
}
