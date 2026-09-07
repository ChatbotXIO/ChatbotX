"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  LIVE_RUN_STATUSES,
  metaCapiEventRepository,
} from "@chatbotx.io/database/repositories"
import {
  coexistSyncRunModel,
  integrationWhatsappModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { isRevokedTokenError } from "@chatbotx.io/integration-whatsapp"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { integrations } from "@/integration"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/**
 * Everything one disconnect must abandon or delete, in a single transaction.
 *
 * Sync history (importedCount / lastSyncedAt / …) is deliberately preserved
 * for audit and so a reconnect can resume from the prior watermark; only
 * ACTIVE runs are abandoned so the scheduler stops trying to drive them
 * forward against a now-missing integration. `LIVE_RUN_STATUSES` includes
 * `waiting`: a WhatsApp coexist run parked for more Meta history must be
 * abandoned here too, otherwise the scheduler cannot revive it (its staging
 * rows are deleted below) and it lingers until the 24h history-window
 * timeout closes it.
 */
async function purgeWhatsappIntegration(
  tx: DatabaseClient,
  {
    integrationWhatsapp,
    ownerId,
    workspaceId,
  }: {
    integrationWhatsapp: IntegrationWhatsappModel
    ownerId: string
    workspaceId: string
  },
): Promise<void> {
  await tx
    .update(coexistSyncRunModel)
    .set({
      status: "failed",
      finishedAt: new Date(),
      currentError: "Integration disconnected",
    })
    .where(
      and(
        eq(coexistSyncRunModel.integrationId, integrationWhatsapp.id),
        inArray(coexistSyncRunModel.status, LIVE_RUN_STATUSES),
      ),
    )

  await tx
    .delete(whatsappCoexistStagingModel)
    .where(
      eq(
        whatsappCoexistStagingModel.phoneNumberId,
        integrationWhatsapp.phoneNumberId,
      ),
    )

  // Polymorphic FK cleanup — no DB-level cascade for
  // MetaCapiEvent.integrationId; stale rows would keep occupying the
  // (workspaceId, channel, sourceKey) dedup slot after a reconnect.
  await metaCapiEventRepository.deleteByIntegration(
    {
      workspaceId,
      channel: "whatsapp",
      integrationId: integrationWhatsapp.id,
    },
    tx,
  )

  await tx
    .delete(integrationWhatsappModel)
    .where(eq(integrationWhatsappModel.id, integrationWhatsapp.id))

  await inboxService.disconnect({
    inboxId: integrationWhatsapp.inboxId,
    ownerId,
    workspaceId,
    tx,
  })
}

export const disconnectWhatsappAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const [integrationWhatsapp, workspace] = await Promise.all([
        findOrFail({
          table: integrationWhatsappModel,
          where: {
            workspaceId,
            id,
          },
          message: "Integration Whatsapp not found",
        }),
        workspaceService.findById({ id: workspaceId }),
      ])

      try {
        await integrations.whatsapp.disconnect(
          integrationWhatsapp.auth as WhatsappAuthValue,
        )
      } catch (error) {
        if (!isRevokedTokenError(error)) {
          throw error
        }
      }

      await db.transaction((tx) =>
        purgeWhatsappIntegration(tx, {
          integrationWhatsapp,
          ownerId: workspace.ownerId,
          workspaceId,
        }),
      )

      await auditService.record({
        action: "disconnect",
        detail: `disconnected the WhatsApp channel (#${integrationWhatsapp.id})`,
      })
    },
  )
