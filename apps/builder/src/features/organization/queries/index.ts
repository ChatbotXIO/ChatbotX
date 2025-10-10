"use server"

import { prisma } from "@aha.chat/database"
import {
  type OrganizationModel,
  type OrganizationSettings,
  type OrganizationWhereInput,
  organizationSettingsSchema,
} from "@aha.chat/database/types"

export async function findOrganization(
  where: OrganizationWhereInput,
): Promise<OrganizationModel> {
  // return await unstable_cache(
  //   async () => {
  return await prisma.organization.findFirstOrThrow({
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

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!settings) {
    throw new Error("Organization settings is not valid")
  }

  return settings
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
    throw new Error(`Organization settings ${settingsKey} is not valid`)
  }

  return value as NonNullable<OrganizationSettings[K]>
}
