import { db } from "@chatbotx.io/database/client"

export async function listFlowVersions({
  where,
}: {
  where: { workspaceId?: string; flowId?: string }
}) {
  const data = await db.query.flowVersionModel.findMany({
    where,
    with: {
      flow: true,
    },
  })

  return { data, pageCount: 1 }
}
