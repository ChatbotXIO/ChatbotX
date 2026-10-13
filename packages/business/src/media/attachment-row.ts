import type { IMessageRepository } from "@chatbotx.io/database/repositories"

/**
 * Updates an attachment row and fails when no row matched. Every caller has
 * just written an object (or reached a verdict) for this row: an update that
 * lands nowhere leaves the row describing something else while the caller
 * reports success, so it must surface as an error the job retries.
 */
export const updateAttachmentOrThrow = async (
  repository: Pick<IMessageRepository, "updateAttachment">,
  params: Parameters<IMessageRepository["updateAttachment"]>[0],
): Promise<void> => {
  if ((await repository.updateAttachment(params)) === 0) {
    throw new Error(`Attachment ${params.id} row was not updated`)
  }
}
