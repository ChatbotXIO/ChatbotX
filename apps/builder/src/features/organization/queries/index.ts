"use server"

import { calcCacheTags } from "@/lib/cache-helper"
import { prisma } from "@aha.chat/database"
import type {
  OrganizationModel,
  OrganizationWhereInput,
} from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"

export const findOrganization = async (
  where: OrganizationWhereInput,
): Promise<OrganizationModel> => {
  return unstable_cache(
    async () => {
      return await prisma.organization.findFirstOrThrow({
        where,
      })
    },
    [JSON.stringify(where)],
    calcCacheTags("organizations"),
  )()
}
