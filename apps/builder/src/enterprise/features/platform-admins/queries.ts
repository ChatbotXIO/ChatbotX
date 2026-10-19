import {
  type PlatformAdminList,
  platformAdminService,
} from "@chatbotx.io/business"

export type PlatformAdminsList = PlatformAdminList

export const listPlatformAdmins = async (
  page: number,
): Promise<PlatformAdminsList> =>
  await platformAdminService.list({ page, perPage: 50 })
