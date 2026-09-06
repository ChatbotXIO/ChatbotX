import { createId } from "@chatbotx.io/utils"
import { type DatabaseClient, db, eq, inArray } from "../../client"
import { whatsappMessageTemplateModel } from "../../schema"

type WhatsappMessageTemplateSyncInput = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: unknown
}

type SyncForIntegrationInput = {
  integrationWhatsappId: string
  templates: WhatsappMessageTemplateSyncInput[]
}

class WhatsappMessageTemplateRepository {
  /**
   * Reconciles the locally-cached WhatsApp message templates for an
   * integration against the incoming list from Meta: deletes stale templates,
   * updates existing ones, inserts new ones. Pure data reconciliation — no
   * business rules — so when `tx` is omitted it opens its own transaction.
   */
  async syncForIntegration(
    input: SyncForIntegrationInput,
    tx?: DatabaseClient,
  ): Promise<void> {
    const run = async (client: DatabaseClient) => {
      const existingTemplates = await client
        .select({
          id: whatsappMessageTemplateModel.id,
          sourceId: whatsappMessageTemplateModel.sourceId,
        })
        .from(whatsappMessageTemplateModel)
        .where(
          eq(
            whatsappMessageTemplateModel.integrationWhatsappId,
            input.integrationWhatsappId,
          ),
        )

      const incomingSourceIds = new Set(
        input.templates.map((template) => template.id),
      )

      const templatesToDelete = existingTemplates.filter(
        (template) => !incomingSourceIds.has(template.sourceId),
      )

      if (templatesToDelete.length > 0) {
        await client.delete(whatsappMessageTemplateModel).where(
          inArray(
            whatsappMessageTemplateModel.id,
            templatesToDelete.map((template) => template.id),
          ),
        )
      }

      for (const template of input.templates) {
        const existing = existingTemplates.find(
          (t) => t.sourceId === template.id,
        )

        if (existing) {
          await client
            .update(whatsappMessageTemplateModel)
            .set({
              name: template.name,
              language: template.language,
              category: template.category,
              status: template.status,
              components: template.components,
            })
            .where(eq(whatsappMessageTemplateModel.id, existing.id))
        } else {
          await client.insert(whatsappMessageTemplateModel).values([
            {
              id: createId(),
              name: template.name,
              integrationWhatsappId: input.integrationWhatsappId,
              language: template.language,
              category: template.category,
              status: template.status,
              sourceId: template.id,
              components: template.components,
            },
          ])
        }
      }
    }

    if (tx) {
      await run(tx)
      return
    }

    await db.transaction(async (transactionClient) => {
      await run(transactionClient)
    })
  }
}

export const whatsappMessageTemplateRepository =
  new WhatsappMessageTemplateRepository()
