import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { organizationModel } from "@chatbotx.io/database/schema"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { getTranslations } from "next-intl/server"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { isCommunity } from "../keys"

class OrganizationService extends BaseService {
  find(props: {
    where: Partial<{ domain: string; id: string }>
    tx?: DatabaseClient
  }): Promise<OrganizationModel | undefined> {
    const { where, tx = db } = props
    return withCache(
      `organizations:find:${btoa(JSON.stringify(props.where))}`,
      () =>
        tx.query.organizationModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) => {
          if (result) {
            return [
              `organizations:${result.id}`,
              `organizations:${result.id}:settings`,
            ]
          }
        },
      },
    )
  }

  async findOrFail(props: {
    where: Partial<{ domain: string; id: string }>
    tx?: DatabaseClient
  }): Promise<OrganizationModel> {
    const t = await getTranslations()
    const { where, tx = db } = props
    const organization = await this.find({ where, tx })
    if (!organization) {
      throw notFoundException(
        t("messages.featureNotFound", { feature: "Organization" }),
      )
    }
    return organization
  }

  findByDomain(domain: string): Promise<OrganizationModel> {
    if (isCommunity()) {
      return this.findOrFail({ where: {} })
    }

    return this.findOrFail({ where: { domain } })
  }

  findById(id: string): Promise<OrganizationModel> {
    return this.findOrFail({ where: { id } })
  }

  async updateSettings(props: {
    tx?: DatabaseClient
    organization: OrganizationModel
    newSettings: OrganizationSettings
  }): Promise<void> {
    const { organization, newSettings, tx = db } = props
    await tx
      .update(organizationModel)
      .set({
        settings: {
          ...organization.settings,
          ...newSettings,
        },
      })
      .where(eq(organizationModel.id, organization.id))

    await this.invalidateCacheTags([
      `organizations:${organization.id}`,
      `organizations:${organization.id}:settings`,
    ])
  }
}

export const organizationService = new OrganizationService()
