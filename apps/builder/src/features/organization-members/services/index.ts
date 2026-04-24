import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { OrganizationMember } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "@/features/common/base.service"

export class OrganizationMemberService extends BaseService {
  findBy(props: {
    tx?: DatabaseClient
    where: Partial<{ organizationId: string; userId: string }>
  }): Promise<OrganizationMember | undefined> {
    const { where, tx = db } = props
    return withCache(
      `organization-members:find:${btoa(JSON.stringify(props.where))}`,
      () =>
        tx.query.organizationMemberModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) => {
          if (result) {
            return [
              `organizations:${result.organizationId}`,
              `organizations:${result.organizationId}:members`,
            ]
          }
        },
      },
    )
  }
}

export const organizationMemberService = new OrganizationMemberService()
