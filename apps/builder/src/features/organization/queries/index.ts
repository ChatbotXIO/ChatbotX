"use server"

import { prisma } from "@aha.chat/database"
import {
  type OrganizationModel,
  type OrganizationSettings,
  type OrganizationWhereInput,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { getDomainFromHeader } from "@/lib/domain"
import { BaseException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"

export async function findOrganizationByDomain(): Promise<OrganizationModel | null> {
  const domain = await getDomainFromHeader()

  return await prisma.organization.findFirst({
    where: {
      domain,
    },
  })
}

export async function findOrganization(
  where: OrganizationWhereInput,
): Promise<OrganizationModel | null> {
  return await prisma.organization.findFirst({
    where,
  })
}

export async function findOrganizationSettings(
  where: OrganizationWhereInput,
): Promise<OrganizationSettings> {
  const organization = await findOrganization(where)
  if (!organization) {
    logger.debug({ where }, "Organization not found")
    throw new BaseException("Organization not found")
  }

  return verifyOrganizationSettings(organization)
}

export async function findOrganizationSettingsByKey<
  K extends keyof OrganizationSettings,
>(
  where: OrganizationWhereInput,
  settingsKey: K,
): Promise<NonNullable<OrganizationSettings[K]>> {
  const settings = await findOrganizationSettings(where)

  const value = settings?.[settingsKey]
  if (!value) {
    throw new BaseException(`Organization settings ${settingsKey} is not valid`)
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
