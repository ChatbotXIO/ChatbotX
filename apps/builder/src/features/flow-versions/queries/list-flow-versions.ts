import { db } from "@aha.chat/database/client"

export async function listFlowVersions({
  where,
}: {
  where: { chatbotId?: string; flowId?: string }
}) {
  const data = await db.query.flowVersionModel.findMany({
    where,
    with: {
      flow: true,
    },
  })

  return { data, pageCount: 1 }
}
