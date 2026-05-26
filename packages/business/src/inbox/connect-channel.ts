import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { inboxModel } from "@chatbotx.io/database/schema"
import type { InboxModel } from "@chatbotx.io/database/types"
import { inboxService } from "./service"

export async function connectChannelIntegration<T>(props: {
  tx: DatabaseClient
  ownerId: string
  inboxData: Omit<typeof inboxModel.$inferInsert, "id"> & { id?: string }
  insertIntegration: (inboxId: string, wasCreated: boolean) => Promise<T>
}): Promise<{ inbox: InboxModel; wasCreated: boolean; integration: T }> {
  const { tx, ownerId, inboxData, insertIntegration } = props

  const { inbox, wasCreated } = await inboxService.create({
    tx,
    ownerId,
    data: inboxData,
  })

  const integration = await insertIntegration(inbox.id, wasCreated)

  return { inbox, wasCreated, integration }
}
