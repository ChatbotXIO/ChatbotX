import { db } from "@chatbotx.io/database/client"
import { magicLinkStatModel } from "@chatbotx.io/database/schema"
import { LinkStatsRepository } from "./link-stats.repository"

export const magicLinkStatsRepository = new LinkStatsRepository(
  magicLinkStatModel,
  {
    workspaceId: magicLinkStatModel.workspaceId,
    linkId: magicLinkStatModel.linkId,
    contactInboxId: magicLinkStatModel.contactInboxId,
    occurredAt: magicLinkStatModel.occurredAt,
  },
)

export async function verifyMagicLinkExists(input: {
  workspaceId: string
  linkId: string
}): Promise<boolean> {
  const row = await db.query.magicLinkModel.findFirst({
    where: { workspaceId: input.workspaceId, id: input.linkId },
    columns: { id: true },
  })
  return Boolean(row)
}
