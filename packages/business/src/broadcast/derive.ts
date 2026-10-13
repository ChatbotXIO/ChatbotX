import type { DatabaseClient } from "@chatbotx.io/database/client"
import { normalizeBroadcastSendLimit } from "@chatbotx.io/database/partials"
import {
  type broadcastModel,
  broadcastTargetModel,
} from "@chatbotx.io/database/schema"
import type { BroadcastModel } from "@chatbotx.io/database/types"

type BroadcastInsert = typeof broadcastModel.$inferInsert

/**
 * The insert values of a broadcast derived from another one — a resend or a
 * run of a repeating broadcast. Everything that defines WHAT is sent and to
 * WHOM is copied; what WHEN and which state it starts in is the caller's.
 */
export const buildDerivedBroadcastValues = (
  source: BroadcastModel,
  overrides: Pick<
    BroadcastInsert,
    "name" | "status" | "schedulesType" | "schedulesAt"
  > &
    Partial<BroadcastInsert>,
): BroadcastInsert => ({
  workspaceId: source.workspaceId,
  flowId: source.flowId,
  integrationWhatsappId: source.integrationWhatsappId,
  integrationMessengerId: source.integrationMessengerId,
  channel: source.channel,
  subaction: source.subaction,
  templateId: source.templateId,
  templateData: source.templateData,
  targetMode: source.targetMode,
  contactFilter: source.contactFilter,
  ...normalizeBroadcastSendLimit(source),
  ...overrides,
})

/** Copies the page rows of `sourceBroadcastId` onto another broadcast (resend, clone, run). */
export const copyBroadcastTargets = async (
  tx: DatabaseClient,
  input: { sourceBroadcastId: string; broadcastId: string },
): Promise<void> => {
  const targets = await tx.query.broadcastTargetModel.findMany({
    where: { broadcastId: input.sourceBroadcastId },
  })
  if (targets.length === 0) {
    return
  }
  await tx.insert(broadcastTargetModel).values(
    targets.map(({ inboxId, flowId, templateId, templateData }) => ({
      broadcastId: input.broadcastId,
      inboxId,
      flowId,
      templateId,
      templateData,
    })),
  )
}
