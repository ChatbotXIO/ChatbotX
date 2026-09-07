import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import {
  integrationInstagramRepository,
  metaCapiEventRepository,
} from "@chatbotx.io/database/repositories"
import { coexistService } from "../coexist/service"
import { inboxService } from "../inbox/service"

/**
 * Transactional cleanup for an Instagram disconnect: coexist teardown
 * (native Instagram only — the Facebook-mediated variant never has coexist
 * runs), the polymorphic MetaCapiEvent rows, the integration row itself, and
 * the owning inbox. The external Meta-API disconnect call and the audit
 * record stay in the builder action (see disconnect-instagram.ts).
 *
 * Kept in a sibling file (rather than a method on `InstagramIntegrationService`)
 * so importing the service alone does not pull in `coexistService` /
 * `inboxService` — that chain reaches `@chatbotx.io/analytics` via
 * `quotaEnforcementService`, which is a much heavier module graph than the
 * plain-query methods on the service need.
 */
export async function deleteInstagramIntegrationWithCleanup(input: {
  workspaceId: string
  id: string
  inboxId: string
  ownerId: string
  isFacebook: boolean
  tx?: DatabaseClient
}): Promise<void> {
  const run = async (tx: DatabaseClient) => {
    if (!input.isFacebook) {
      await coexistService.tearDownForIntegration({
        workspaceId: input.workspaceId,
        integrationId: input.id,
        channel: "instagram",
        currentError: "Integration disconnected",
        tx,
      })
    }

    // Polymorphic FK cleanup — stale MetaCapiEvent rows would keep occupying
    // the (workspaceId, channel, sourceKey) dedup slot after a reconnect.
    await metaCapiEventRepository.deleteByIntegration(
      {
        workspaceId: input.workspaceId,
        channel: "instagram",
        integrationId: input.id,
      },
      tx,
    )

    await integrationInstagramRepository.deleteById({ id: input.id }, tx)

    await inboxService.disconnect({
      inboxId: input.inboxId,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      tx,
    })
  }

  if (input.tx) {
    await run(input.tx)
    return
  }

  await db.transaction(run)
}
