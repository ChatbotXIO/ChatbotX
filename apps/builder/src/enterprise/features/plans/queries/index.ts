import { db } from "@aha.chat/database/client"
import { findOrganizationByDomain } from "@/features/organization/queries"
import { notFoundException } from "@/lib/errors/exception"
import type { ListPlansRequest, ListPlansResponse } from "../schemas/query"

export const listPlansRSC = async (input: ListPlansRequest) => {
  const organization = await findOrganizationByDomain()
  if (!organization) {
    throw notFoundException("Organization not found")
  }

  return listPlans({
    ...input,
    organizationId: organization.id,
  })
}

export const listPlans = async (
  input: ListPlansRequest & { organizationId: string },
): Promise<ListPlansResponse> => {
  const where = {
    organizationId: input.organizationId,
  }

  const data = await db.query.planModel.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return {
    data,
    pageCount: 1,
  }
}
