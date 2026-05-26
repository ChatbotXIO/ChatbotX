import { organizationService } from "@chatbotx.io/business"
import {
  db,
  desc,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  organizationMemberModel,
  sessionModel,
} from "@chatbotx.io/database/schema"
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

  const userIds = data.map((d) => d.userId)
  const lastSessions = userIds.length
    ? await db
        .selectDistinctOn([sessionModel.userId], {
          userId: sessionModel.userId,
          updatedAt: sessionModel.updatedAt,
        })
        .from(sessionModel)
        .where(inArray(sessionModel.userId, userIds))
        .orderBy(sessionModel.userId, desc(sessionModel.updatedAt))
    : []

  const lastActiveByUserId = new Map(
    lastSessions.map((s) => [s.userId, s.updatedAt]),
  )

  const dataWithLastActive = data.map((member) => ({
    ...member,
    lastActiveAt: lastActiveByUserId.get(member.userId) ?? null,
  }))

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data: dataWithLastActive, pageCount, ...pagination }
}
