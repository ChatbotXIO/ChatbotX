import type { StoreSource } from "@chatbotx.io/database/partials"
import { ecommerceSettingsRepository } from "@chatbotx.io/database/repositories"
import { withCache } from "@chatbotx.io/redis"

/** The tag every cached read of a workspace's store settings carries. */
export const ecommerceSettingsCacheTag = (workspaceId: string) =>
  `ecommerce-settings:${workspaceId}`

/**
 * Where the store's catalog and orders come from. Its own module, apart from
 * `ecommerceSettingsService`, so the catalog services can read it without
 * pulling in everything the settings validation needs. Cached under the
 * settings tag, so saving the settings drops it too.
 */
export const resolveStoreSource = async (
  workspaceId: string,
): Promise<StoreSource> =>
  await withCache(
    `${ecommerceSettingsCacheTag(workspaceId)}:store-source`,
    async () =>
      (await ecommerceSettingsRepository.find(workspaceId))?.storeSource ??
      "chatbotx",
    { tags: [ecommerceSettingsCacheTag(workspaceId)] },
  )
