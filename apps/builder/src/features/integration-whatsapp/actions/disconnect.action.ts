"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import {
  coexistSyncRunModel,
  integrationWhatsappModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { isRevokedTokenError } from "@chatbotx.io/integration-whatsapp"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

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

      await db.transaction(async (tx) => {
        // Preserve sync history (importedCount / lastSyncedAt / etc.) for
        // audit and so reconnect can resume from prior watermark. Only abandon
        // ACTIVE runs so the scheduler stops trying to drive them forward
        // against a now-missing integration.
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
              inArray(coexistSyncRunModel.status, ["init", "running"]),
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
          ownerId: workspace.ownerId,
          workspaceId,
          tx,
        })
      })
    },
  )
