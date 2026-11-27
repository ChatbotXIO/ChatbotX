import { createId } from "@chatbotx.io/utils"
import type { DatabaseClient } from "../../src/client"
import { publishDestinationRepository } from "../../src/repositories/publish-destination"
// biome-ignore lint/performance/noNamespaceImport: schema registration mirrors the database client
import * as schema from "../../src/schema"

/**
 * An inbox of the workspace and its publish binding, the destination the post
 * tables point at. Returns the binding id.
 */
export const insertPublishDestination = async (
  db: DatabaseClient,
  input: { label: string; workspaceId: string },
): Promise<string> => {
  const [inbox] = await db
    .insert(schema.inboxModel)
    .values({
      channel: "messenger",
      name: input.label,
      sourceId: `page-${input.label}-${createId()}`,
      workspaceId: input.workspaceId,
    })
    .returning({ id: schema.inboxModel.id })
  const [binding] = await publishDestinationRepository.ensureForInboxes(
    { inboxIds: [inbox.id], workspaceId: input.workspaceId },
    db,
  )
  return binding.id
}
