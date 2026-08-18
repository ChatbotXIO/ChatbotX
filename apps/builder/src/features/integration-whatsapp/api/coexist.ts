import { and, db, eq } from "@chatbotx.io/database/client"
import {
  coexistSyncRunModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { triggerSmbAppDataSync } from "@chatbotx.io/integration-whatsapp/api/coexists"
import { SdkException } from "@chatbotx.io/sdk"
import { z } from "zod"
import { logger } from "@/lib/log"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const setCoexistWhatsappRequest = z.object({
  workspaceId: z.string(),
  integrationId: z.string(),
  enabled: z.boolean(),
  aiReadsSyncedHistory: z.boolean().optional().default(false),
})
export type SetCoexistWhatsappRequest = z.infer<
  typeof setCoexistWhatsappRequest
>

const setCoexistWhatsappFailureReason = z.union([
  z.literal("already_triggered"),
  z.literal("window_expired"),
  z.literal("not_eligible"),
  z.literal("trigger_failed"),
  z.string(),
])

const setCoexistWhatsappResponse = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }),
  z.object({
    success: z.literal(false),
    reason: setCoexistWhatsappFailureReason.optional(),
    msg: z.string().optional(),
  }),
])
export type SetCoexistWhatsappResponse = z.infer<
  typeof setCoexistWhatsappResponse
>

export const integrationWhatsappCoexistAPIs = {
  setCoexistWhatsappAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/whatsapp/{integrationId}/coexist",
      summary: "Enable or disable WhatsApp coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistWhatsappRequest)
    .output(setCoexistWhatsappResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, integrationId, enabled, aiReadsSyncedHistory } =
        input

      // Atomic UPDATE + RETURNING gates on workspaceId (tenancy) and yields
      // phoneNumberId + auth in one round trip — no separate findFirst, no
      // race window between flag write and queue enqueue.
      //
      // `coexistAiReadsSyncedHistory` is set ONLY when enabling — the popup also
      // POSTs on decline (`enabled: false`), and this UPDATE runs before the
      // `if (enabled)` branch below, so a decline must never write it.
      const [updated] = await db
        .update(integrationWhatsappModel)
        .set({
          coexistEnabled: enabled,
          ...(enabled
            ? { coexistAiReadsSyncedHistory: aiReadsSyncedHistory }
            : {}),
        })
        .where(
          and(
            eq(integrationWhatsappModel.id, integrationId),
            eq(integrationWhatsappModel.workspaceId, workspaceId),
          ),
        )
        .returning({
          phoneNumberId: integrationWhatsappModel.phoneNumberId,
          auth: integrationWhatsappModel.auth,
        })

      if (!updated) {
        return { success: false as const }
      }

      if (enabled) {
        const [run] = await db
          .insert(coexistSyncRunModel)
          .values({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "whatsapp",
            status: "init",
            triggerSource: "popup-enable",
          })
          .returning({ id: coexistSyncRunModel.id })

        // Per Meta docs ("Synchronizing WhatsApp Business app data"), webhook
        // subscription alone does NOT cause Meta to push history/contact
        // payloads. The integrating app must POST /{phone-number-id}/smb_app_data
        // with sync_type once per onboarding (24h window). Without these
        // calls, the staging table stays empty forever.
        const auth = updated.auth as WhatsappAuthValue
        const phoneNumberId = updated.phoneNumberId
        try {
          const stateResult = await triggerSmbAppDataSync({
            auth,
            phoneNumberId,
            syncType: "smb_app_state_sync",
          })
          const historyResult = await triggerSmbAppDataSync({
            auth,
            phoneNumberId,
            syncType: "history",
          })

          if (!(stateResult.ok && historyResult.ok)) {
            let reason: string | undefined

            if (!stateResult.ok) {
              reason = stateResult.reason
            } else if (!historyResult.ok) {
              reason = historyResult.reason
            }

            if (reason && run) {
              await db
                .update(coexistSyncRunModel)
                .set({
                  status: "failed",
                  currentError: `smb_app_data ${reason}`,
                  finishedAt: new Date(),
                })
                .where(eq(coexistSyncRunModel.id, run.id))
            }
            return reason
              ? { success: false as const, reason }
              : { success: false as const }
          }
        } catch (err) {
          logger.error({ err, integrationId }, "smb_app_data trigger failed")

          if (run) {
            await db
              .update(coexistSyncRunModel)
              .set({
                status: "failed",
                currentError:
                  err instanceof Error ? err.message : "smb_app_data error",
                finishedAt: new Date(),
              })
              .where(eq(coexistSyncRunModel.id, run.id))
          }

          return {
            success: false as const,
            reason: "trigger_failed" as const,
            msg: err instanceof SdkException ? err.message : undefined,
          }
        }
      }
      // Disable path: no cleanup. If the customer never pressed Enable, no
      // history was ever staged. If they did enable then disable, the prior
      // staging is retained — flipping the flag is enough to stop new flushes.

      return { success: true as const }
    }),
}
