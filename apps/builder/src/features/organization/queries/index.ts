"use server"

import { prisma } from "@aha.chat/database"
import type {
  OrganizationModel,
  OrganizationWhereInput,
} from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { calcCacheTags } from "@/lib/cache-helper"

export const findOrganization = async (
  where: OrganizationWhereInput,
): Promise<OrganizationModel> => {
  return await unstable_cache(
    async () => {
      return await prisma.organization.findFirstOrThrow({
        where,
      })
    },
    [JSON.stringify(where)],
    calcCacheTags("organizations"),
  )()
}
