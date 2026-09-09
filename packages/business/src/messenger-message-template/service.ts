import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
} from "@chatbotx.io/database/client"
import type { MessengerTemplateStatus } from "@chatbotx.io/database/partials"
import { messengerMessageTemplateModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

type MessengerMessageTemplateListWhere = {
  workspaceId: string
  inboxId?: string
  integrationMessengerId?: string
  status?: MessengerTemplateStatus
  name?: string
}

/** Meta's message-template shape, as returned by `listMessageTemplates`. */
export type MetaMessengerTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  parameter_format?: string
  components: unknown
}

class MessengerMessageTemplateService extends BaseService {
  private async resolveIntegrationMessengerId({
    tx,
    where,
  }: {
    tx: DatabaseClient
    where: MessengerMessageTemplateListWhere
  }) {
    let resolvedIntegrationMessengerId = where.integrationMessengerId

    if (!resolvedIntegrationMessengerId && where.inboxId) {
      const integration = await tx.query.integrationMessengerModel.findFirst({
        where: {
          workspaceId: where.workspaceId,
          inboxId: where.inboxId,
        },
        columns: { id: true },
      })
      resolvedIntegrationMessengerId = integration?.id
    }

    return resolvedIntegrationMessengerId
  }

  async list(props: {
    tx?: DatabaseClient
    where: MessengerMessageTemplateListWhere
  }) {
    const { tx = db, where } = props

    // Resolve integrationMessengerId from inboxId when only inboxId is given.
    // Relying on nested relational filtering for inboxId is fragile and ORM-
    // version-sensitive because messengerMessageTemplateModel has no direct
    // inboxId column.
    const resolvedIntegrationMessengerId =
      await this.resolveIntegrationMessengerId({ tx, where })

    return tx.query.messengerMessageTemplateModel.findMany({
      where: {
        status: where.status,
        integrationMessengerId: resolvedIntegrationMessengerId,
        integrationMessenger: {
          workspaceId: where.workspaceId,
        },
      },
      with: {
        integrationMessenger: true,
      },
      orderBy: { id: "desc" },
    })
  }

  async listPaginated(props: {
    tx?: DatabaseClient
    where: MessengerMessageTemplateListWhere
    page?: number
    perPage?: number
  }) {
    const { tx = db, where } = props
    const resolvedIntegrationMessengerId =
      await this.resolveIntegrationMessengerId({ tx, where })
    const queryWhere = {
      name: where.name ? { ilike: likeContains(where.name) } : undefined,
      status: where.status,
      integrationMessengerId: resolvedIntegrationMessengerId,
      integrationMessenger: {
        workspaceId: where.workspaceId,
      },
    }
    const pagination = getPaginationWithDefaults({
      page: props.page,
      perPage: props.perPage,
    })

    const [data, total] = await Promise.all([
      tx.query.messengerMessageTemplateModel.findMany({
        where: queryWhere,
        with: {
          integrationMessenger: true,
        },
        orderBy: { id: "desc" },
        limit: pagination.limit,
        offset: pagination.offset,
      }),
      tx.$count(
        messengerMessageTemplateModel,
        and(
          where.name
            ? ilike(
                messengerMessageTemplateModel.name,
                likeContains(where.name),
              )
            : undefined,
          where.status
            ? eq(messengerMessageTemplateModel.status, where.status)
            : undefined,
          resolvedIntegrationMessengerId
            ? eq(
                messengerMessageTemplateModel.integrationMessengerId,
                resolvedIntegrationMessengerId,
              )
            : undefined,
        ),
      ),
    ])

    return {
      data,
      pageCount: Math.max(1, Math.ceil(total / pagination.limit)),
    }
  }

  findByIdForIntegration(props: {
    id: string
    integrationMessengerId: string
    workspaceId: string
  }) {
    return db.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: props.id,
        integrationMessengerId: props.integrationMessengerId,
        integrationMessenger: { workspaceId: props.workspaceId },
      },
    })
  }

  /** Approved-only template lookup for outbound template sends, scoped by workspace through the integration relation. */
  findApprovedByIdForIntegration(props: {
    id: string
    integrationMessengerId: string
    workspaceId: string
  }) {
    return db.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: props.id,
        integrationMessengerId: props.integrationMessengerId,
        integrationMessenger: { workspaceId: props.workspaceId },
        status: "APPROVED",
      },
    })
  }

  async delete(props: {
    id: string
    integrationMessengerId: string
  }): Promise<void> {
    await db
      .delete(messengerMessageTemplateModel)
      .where(
        and(
          eq(messengerMessageTemplateModel.id, props.id),
          eq(
            messengerMessageTemplateModel.integrationMessengerId,
            props.integrationMessengerId,
          ),
        ),
      )
  }

  /**
   * Merges Meta's current template list into the local table for one
   * integration: an exact-match query (`templateId`/`templateName`/
   * `templateLanguage` all set) is a partial sync — only those templates are
   * upserted, existing rows outside the filter are left alone. A full sync
   * (no filter) also deletes local rows Meta no longer reports.
   */
  async syncFromMeta(props: {
    integrationMessengerId: string
    templates: MetaMessengerTemplate[]
    isPartialSync: boolean
  }): Promise<void> {
    await db.transaction(async (tx) => {
      if (!props.isPartialSync) {
        const existingTemplates = await tx
          .select({
            id: messengerMessageTemplateModel.id,
            sourceId: messengerMessageTemplateModel.sourceId,
          })
          .from(messengerMessageTemplateModel)
          .where(
            eq(
              messengerMessageTemplateModel.integrationMessengerId,
              props.integrationMessengerId,
            ),
          )

        const incomingSourceIds = new Set(props.templates.map((t) => t.id))
        const templatesToDelete = existingTemplates.filter(
          (t) => !incomingSourceIds.has(t.sourceId),
        )

        if (templatesToDelete.length > 0) {
          await tx.delete(messengerMessageTemplateModel).where(
            inArray(
              messengerMessageTemplateModel.id,
              templatesToDelete.map((t) => t.id),
            ),
          )
        }
      }

      for (const template of props.templates) {
        await tx
          .insert(messengerMessageTemplateModel)
          .values([
            {
              id: createId(),
              name: template.name,
              integrationMessengerId: props.integrationMessengerId,
              language: template.language,
              category: template.category,
              status: template.status,
              parameterFormat: template.parameter_format ?? "POSITIONAL",
              sourceId: template.id,
              components: template.components,
            },
          ])
          .onConflictDoUpdate({
            target: [
              messengerMessageTemplateModel.integrationMessengerId,
              messengerMessageTemplateModel.sourceId,
            ],
            set: {
              name: template.name,
              language: template.language,
              category: template.category,
              status: template.status,
              parameterFormat: template.parameter_format ?? "POSITIONAL",
              components: template.components,
            },
          })
      }
    })
  }
}

export const messengerMessageTemplateService =
  new MessengerMessageTemplateService()
