import {
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import type { WhatsappTemplateStatus } from "@chatbotx.io/database/partials"
import { whatsappMessageTemplateModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

/** WhatsApp's message-template shape, as returned by `listMessageTemplates`. */
export type MetaWhatsappTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: unknown
}

class WhatsappMessageTemplateService extends BaseService {
  list(props: {
    tx?: DatabaseClient
    where: {
      workspaceId: string
      inboxId?: string
      integrationWhatsappId?: string
      status?: WhatsappTemplateStatus
    }
  }) {
    const { tx = db, where } = props

    const queryWhere = {
      integrationWhatsappId: where.integrationWhatsappId,
      integrationWhatsapp: {
        workspaceId: where.workspaceId,
        inboxId: where.inboxId,
      },
    }

    return tx.query.whatsappMessageTemplateModel.findMany({
      where: queryWhere,
      with: {
        integrationWhatsapp: true,
      },
      orderBy: { createdAt: "asc" },
    })
  }

  /** Full sync only — WhatsApp's template sync has no partial-match mode. */
  async syncFromMeta(props: {
    integrationWhatsappId: string
    templates: MetaWhatsappTemplate[]
  }): Promise<void> {
    await db.transaction(async (tx) => {
      const existingTemplates = await tx
        .select({
          id: whatsappMessageTemplateModel.id,
          sourceId: whatsappMessageTemplateModel.sourceId,
        })
        .from(whatsappMessageTemplateModel)
        .where(
          eq(
            whatsappMessageTemplateModel.integrationWhatsappId,
            props.integrationWhatsappId,
          ),
        )

      const incomingSourceIds = new Set(props.templates.map((t) => t.id))

      const templatesToDelete = existingTemplates.filter(
        (t) => !incomingSourceIds.has(t.sourceId),
      )

      if (templatesToDelete.length > 0) {
        await tx.delete(whatsappMessageTemplateModel).where(
          inArray(
            whatsappMessageTemplateModel.id,
            templatesToDelete.map((t) => t.id),
          ),
        )
      }

      for (const template of props.templates) {
        const existing = existingTemplates.find(
          (t) => t.sourceId === template.id,
        )

        if (existing) {
          await tx
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
          await tx.insert(whatsappMessageTemplateModel).values([
            {
              id: createId(),
              name: template.name,
              integrationWhatsappId: props.integrationWhatsappId,
              language: template.language,
              category: template.category,
              status: template.status,
              sourceId: template.id,
              components: template.components,
            },
          ])
        }
      }
    })
  }
}

export const whatsappMessageTemplateService =
  new WhatsappMessageTemplateService()
