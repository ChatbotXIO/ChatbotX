import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"
import { templateInstallationSyncRepository } from "@chatbotx.io/database/repositories"
import { isManifestKind } from "./adapters/manifests/kinds"
import { getTemplateAdapter } from "./adapters/registry"
import { isUpdatable } from "./adapters/shared"
import { hashCanonical } from "./payload-hash"

/**
 * Records, for every copy whose category can be synced and that has no
 * baseline yet, the hash of what the install or sync just wrote. The next sync compares the copy's current
 * content against it to tell an edited copy from an untouched one. Copies the
 * installer already owned, detached ones and categories without a sync
 * handler stay unstamped.
 */
export const stampSyncedHashes = async (
  tx: DatabaseClient,
  installationId: string,
  version: number,
  /** Rows a sync deliberately left untouched: stamping them would hide the installer's edits. */
  skipRowIds: ReadonlySet<string> = new Set(),
): Promise<void> => {
  const rows = await templateInstallationSyncRepository.listInstalledResources(
    installationId,
    tx,
  )
  for (const row of rows) {
    // Only copies never stamped before (a fresh install or a newly added item);
    // a baseline, once set, is only ever moved by a sync that wrote the copy.
    if (
      row.wasExisting ||
      row.detachedAt ||
      row.syncedVersion !== null ||
      isManifestKind(row.resourceKind) ||
      skipRowIds.has(row.id)
    ) {
      continue
    }
    const handler = getTemplateAdapter(
      row.category as TemplateResourceCategory,
    )?.sync
    if (!(handler && isUpdatable(handler))) {
      continue
    }
    const content = await handler.project(tx, row.resourceId)
    await templateInstallationSyncRepository.markSynced(
      {
        id: row.id,
        syncedHash: content === null ? null : await hashCanonical(content),
        syncedVersion: version,
      },
      tx,
    )
  }
}
