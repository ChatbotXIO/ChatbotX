"use server"

import { prisma } from "@aha.chat/database"
import {
  type OrganizationModel,
  type OrganizationSettings,
  type OrganizationWhereInput,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { headers } from "next/headers"
import { calcCacheTags } from "@/lib/cache-helper"
import { BaseException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"

export async function findOrganizationByDomain(): Promise<OrganizationModel | null> {
  const headersList = await headers()
  const domain = new URL(headersList.get("x-url") ?? "")

  return await unstable_cache(
    async () =>
      await prisma.organization.findFirst({
        where: {
          domain: domain.hostname,
        },
      }),
    ["organization"],
    calcCacheTags(`organizations:${domain.hostname}`),
  )()
}

export async function findOrganization(
  where: OrganizationWhereInput,
): Promise<OrganizationModel | null> {
  // return await unstable_cache(
  //   async () => {
  return await prisma.organization.findFirst({
    where,
  })
  //   },
  //   [JSON.stringify(where)],
  //   calcCacheTags("organizations"),
  // )()
}

export async function findOrganizationSettings(
  where: OrganizationWhereInput,
): Promise<OrganizationSettings> {
  const organization = await findOrganization(where)
  if (!organization) {
    logger.error("Organization not found", { where })
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
  logger.info("Organization settings", { settings })

  if (!settings) {
    throw new Error("Organization settings is not valid")
  }

  return await settings
}
