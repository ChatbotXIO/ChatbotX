"use server"

import { db } from "@chatbotx.io/database/client"
import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { organizationSettingsSchema } from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { getDomainFromHeader } from "@/lib/domain"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"

type OrganizationWhere = Partial<{ domain: string; id: string }>

export async function findOrganizationByDomain(): Promise<
  OrganizationModel | undefined
> {
  const domain = await getDomainFromHeader()
  return await db.query.organizationModel.findFirst({
    where: { domain },
  })
}

export async function findOrganization(
  where: OrganizationWhere,
): Promise<OrganizationModel | undefined> {
  return await db.query.organizationModel.findFirst({
    where,
  })
}

export async function findOrganizationSettings(
  where: OrganizationWhere,
): Promise<OrganizationSettings> {
  const organization = await findOrganization(where)
  if (!organization) {
    logger.debug({ where }, "Organization not found")
    throw new ChatbotXException("Organization not found")
  }

  return verifyOrganizationSettings(organization)
}

export async function findOrganizationSettingsByKey<
  K extends keyof OrganizationSettings,
>(
  where: Record<string, unknown>,
  settingsKey: K,
): Promise<NonNullable<OrganizationSettings[K]>> {
  const settings = await findOrganizationSettings(where)

  const value = settings?.[settingsKey]
  if (!value) {
    throw new ChatbotXException(
      `Organization settings ${settingsKey} is not valid`,
    )
  }

  return value as NonNullable<OrganizationSettings[K]>
}

export async function verifyOrganizationSettings(
  organization: OrganizationModel,
): Promise<OrganizationSettings> {
  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!settings) {
    throw new Error("Organization settings is not valid")
  }

  return await settings
}
