import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
} from "@chatbotx.io/database/client"
import type { MessengerTemplateStatus } from "@chatbotx.io/database/partials"
import { messengerMessageTemplateModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import type { ListMessengerMessageTemplatesResponse } from "@/features/integration-messenger/message-templates/schema/query"

type MessengerMessageTemplateListWhere = {
  workspaceId: string
  inboxId?: string
  integrationMessengerId?: string
  status?: MessengerTemplateStatus
  name?: string
}

async function resolveIntegrationMessengerId({
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

export const messengerMessageTemplateService = {
  list: async (props: {
    tx?: DatabaseClient
    where: MessengerMessageTemplateListWhere
  }): Promise<ListMessengerMessageTemplatesResponse> => {
    const { tx = db, where } = props

    // Resolve integrationMessengerId from inboxId when only inboxId is given.
    // Relying on nested relational filtering for inboxId is fragile and ORM-
    // version-sensitive because messengerMessageTemplateModel has no direct
    // inboxId column.
    const resolvedIntegrationMessengerId = await resolveIntegrationMessengerId({
      tx,
      where,
    })

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
  },
  listPaginated: async (props: {
    tx?: DatabaseClient
    where: MessengerMessageTemplateListWhere
    page?: number
    perPage?: number
  }) => {
    const { tx = db, where } = props
    const resolvedIntegrationMessengerId = await resolveIntegrationMessengerId({
      tx,
      where,
    })
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
  },
}
