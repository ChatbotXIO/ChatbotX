import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { getTranslations } from "next-intl/server"
import { notFoundException } from "@/lib/errors/exception"

export const organizationService = {
  find: (props: {
    where: Partial<{ domain: string; id: string }>
    tx?: DatabaseClient
  }) => {
    const { where, tx = db } = props
    return withCache(
      `organizations:find:${btoa(JSON.stringify(props.where))}`,
      () =>
        tx.query.organizationModel.findFirst({
          where,
        }),
      {
        tags: ["organizations"],
      },
    )
  },

  findOrFail: async (props: {
    where: Partial<{ domain: string; id: string }>
    tx?: DatabaseClient
  }): Promise<OrganizationModel> => {
    const t = await getTranslations()
    const { where, tx = db } = props
    const organization = await organizationService.find({ where, tx })
    if (!organization) {
      throw notFoundException(
        t("messages.featureNotFound", { feature: "Organization" }),
      )
    }
    return organization
  },

  findByDomain: (domain: string): Promise<OrganizationModel> => {
    return organizationService.findOrFail({ where: { domain } })
  },

  findById: (id: string): Promise<OrganizationModel> => {
    return organizationService.findOrFail({ where: { id } })
  },
}
