import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationMessengerRepository,
  metaCapiEventRepository,
} from "@chatbotx.io/database/repositories"
import { tagChannelModel } from "@chatbotx.io/database/schema"
import { coexistService } from "../coexist/service"
import { inboxService } from "../inbox/service"

/**
 * Transactional cleanup for a Messenger disconnect: coexist teardown, the
 * polymorphic TagChannel + MetaCapiEvent rows, the integration row itself,
 * and the owning inbox. The external Meta-API disconnect call and the audit
 * record stay in the builder action (see disconnect-messenger.ts).
 *
 * Kept in a sibling file (rather than a method on `MessengerIntegrationService`)
 * so importing the service alone does not pull in `coexistService` /
 * `inboxService` — that chain reaches `@chatbotx.io/analytics` via
 * `quotaEnforcementService`, which is a much heavier module graph than the
 * plain-query methods on the service need.
 */
export async function deleteMessengerIntegrationWithCleanup(input: {
  workspaceId: string
  id: string
  inboxId: string
  ownerId: string
  tx?: DatabaseClient
}): Promise<void> {
  const run = async (tx: DatabaseClient) => {
    await coexistService.tearDownForIntegration({
      workspaceId: input.workspaceId,
      integrationId: input.id,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx,
    })

    // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
    await tx
      .delete(tagChannelModel)
      .where(
        and(
          eq(tagChannelModel.channelType, channelTypes.enum.messenger),
          eq(tagChannelModel.integrationId, input.id),
        ),
      )

    // Polymorphic FK cleanup — stale MetaCapiEvent rows would keep occupying
    // the (workspaceId, channel, sourceKey) dedup slot after a reconnect.
    await metaCapiEventRepository.deleteByIntegration(
      {
        workspaceId: input.workspaceId,
        channel: "messenger",
        integrationId: input.id,
      },
      tx,
    )

    await integrationMessengerRepository.deleteById({ id: input.id }, tx)

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
