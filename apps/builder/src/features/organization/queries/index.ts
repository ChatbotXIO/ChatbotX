"use server"

import { prisma } from "@aha.chat/database"
import type {
  OrganizationModel,
  OrganizationWhereInput,
} from "@aha.chat/database/types"

export const findOrganization = async (
  where: OrganizationWhereInput,
): Promise<OrganizationModel> => {
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
