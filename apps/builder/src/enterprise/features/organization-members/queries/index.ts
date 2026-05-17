import { organizationService } from "@chatbotx.io/business"
import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { organizationMemberModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"

import { getDomainFromHeader } from "@/lib/domain"
import type {
  ListOrganizationMembersRequest,
  ListOrganizationMembersResponse,
} from "../schema/mutation"

export const listOrganizationMembersRSC = async (
  input: ListOrganizationMembersRequest,
): Promise<ListOrganizationMembersResponse> => {
  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

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
