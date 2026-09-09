import { db } from "@chatbotx.io/database/client"
import { refLinkStatModel } from "@chatbotx.io/database/schema"
import { LinkStatsRepository } from "./link-stats.repository"

export const refLinkStatsRepository = new LinkStatsRepository(
  refLinkStatModel,
  {
    workspaceId: refLinkStatModel.workspaceId,
    linkId: refLinkStatModel.linkId,
    contactInboxId: refLinkStatModel.contactInboxId,
    occurredAt: refLinkStatModel.occurredAt,
  },
)

export async function verifyRefLinkExists(input: {
  workspaceId: string
  linkId: string
}): Promise<boolean> {
  const row = await db.query.reflinkModel.findFirst({
    where: { workspaceId: input.workspaceId, id: input.linkId },
    columns: { id: true },
  })
  return Boolean(row)
}
