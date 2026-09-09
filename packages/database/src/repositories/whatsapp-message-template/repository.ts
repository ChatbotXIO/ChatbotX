import { type DatabaseClient, db } from "../../client"

export const whatsappMessageTemplateRepository = {
  /**
   * Template ids for a WhatsApp integration, used to filter flows by their
   * start-step template (`sendWaTemplateMessage`). Kept minimal and
   * read-only — the meta-channels scope owns `syncForIntegration` and other
   * write paths for this table.
   */
  async listIdsByIntegration(
    input: { integrationWhatsappId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const templates = await tx.query.whatsappMessageTemplateModel.findMany({
      where: { integrationWhatsappId: input.integrationWhatsappId },
      columns: { id: true },
    })
    return templates.map((t) => t.id)
  },
}
