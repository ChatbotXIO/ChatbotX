import { db } from "@chatbotx.io/database/client"
import { organizationService } from "@/features/organization/services"
import { getDomainFromHeader } from "@/lib/domain"
import type { ListPlansRequest, ListPlansResponse } from "../schemas/query"

export const listPlansRSC = async (input: ListPlansRequest) => {
  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

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
