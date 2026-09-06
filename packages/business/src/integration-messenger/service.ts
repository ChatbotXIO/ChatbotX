import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import type { IntegrationUserInfo } from "@chatbotx.io/database/partials"
import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import {
  integrationMessengerModel,
  messengerMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

type MetaMessageTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  parameter_format?: string
  components: unknown
}

class MessengerIntegrationService extends BaseService {
  findByInboxId(inboxId: string) {
    return findOrFail({ table: integrationMessengerModel, where: { inboxId } })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationMessengerModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return db.query.integrationMessengerModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  findByPageId(props: { workspaceId: string; pageId: string }) {
    return db.query.integrationMessengerModel.findFirst({
      where: { workspaceId: props.workspaceId, pageId: props.pageId },
    })
  }

  /**
   * Replace the stored OAuth credentials after an OAuth reconnect. Scoped by
   * workspace so a forged integration id can never touch another tenant's row.
   */
  async updateAuth(props: {
    id: string
    workspaceId: string
    auth: Record<string, unknown>
    name?: string
    userInfo?: IntegrationUserInfo
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({
        auth: props.auth,
        tokenRefreshError: null,
        ...(props.name ? { name: props.name } : {}),
        ...(props.userInfo ? { userInfo: props.userInfo } : {}),
      })
      .where(
        and(
          eq(integrationMessengerModel.id, props.id),
          eq(integrationMessengerModel.workspaceId, props.workspaceId),
        ),
      )
  }

  findAllForTokenRefresh() {
    return db
      .select({
        id: integrationMessengerModel.id,
        workspaceId: integrationMessengerModel.workspaceId,
        auth: integrationMessengerModel.auth,
      })
      .from(integrationMessengerModel)
  }

  findForTokenRefreshByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db
      .select({
        id: integrationMessengerModel.id,
        workspaceId: integrationMessengerModel.workspaceId,
        auth: integrationMessengerModel.auth,
      })
      .from(integrationMessengerModel)
      .where(inArray(integrationMessengerModel.workspaceId, workspaceIds))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationMessengerModel.id, id))
  }

  /**
   * Store the authorizing user's identity after a connect. Separate from the
   * insert because the avatar upload is an external call that must stay outside
   * the connect transaction.
   */
  async updateUserInfo(props: {
    id: string
    workspaceId: string
    userInfo: IntegrationUserInfo
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({ userInfo: props.userInfo })
      .where(
        and(
          eq(integrationMessengerModel.id, props.id),
          eq(integrationMessengerModel.workspaceId, props.workspaceId),
        ),
      )
  }

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMessengerModel.findMany({
      where: { workspaceId },
    })
  }

  /**
   * Page ids from the given list that already have a Messenger integration.
   * `IntegrationMessenger.pageId` is unique platform-wide, so a match means the
   * page cannot be connected again anywhere.
   */
  async findConnectedPageIds(pageIds: string[]): Promise<string[]> {
    if (pageIds.length === 0) {
      return []
    }

    const rows = await db
      .select({ pageId: integrationMessengerModel.pageId })
      .from(integrationMessengerModel)
      .where(inArray(integrationMessengerModel.pageId, pageIds))

    return rows.map((row) => row.pageId)
  }

  /**
   * Whether a Messenger integration still exists for a Facebook page under a
   * specific Meta app (`clientId`). Cross-workspace by design: the page webhook
   * subscription is global, so a surviving row must block a sibling channel from
   * unsubscribing it.
   */
  async existsForPage(props: {
    pageId: string
    clientId: string
  }): Promise<boolean> {
    const rows = await db
      .select({ id: integrationMessengerModel.id })
      .from(integrationMessengerModel)
      .where(
        and(
          eq(integrationMessengerModel.pageId, props.pageId),
          sql`${integrationMessengerModel.auth} ->> 'clientId' = ${props.clientId}`,
        ),
      )
      .limit(1)

    return rows.length > 0
  }

  async updateSettings(input: {
    workspaceId: string
    id: string
    values: Partial<typeof integrationMessengerModel.$inferInsert>
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set(input.values)
      .where(
        and(
          eq(integrationMessengerModel.id, input.id),
          eq(integrationMessengerModel.workspaceId, input.workspaceId),
        ),
      )
  }

  listForWorkspace(input: { workspaceId: string; id?: string }) {
    return integrationMessengerRepository.listForWorkspace(input)
  }

  /**
   * Reconciles the locally-cached Messenger message templates for an
   * integration against Meta's list: full sync deletes rows no longer
   * present upstream; partial sync (a single created/cloned template) never
   * deletes.
   */
  async syncMessageTemplates(input: {
    integrationMessengerId: string
    templates: MetaMessageTemplate[]
    isPartialSync: boolean
  }): Promise<void> {
    await db.transaction(async (tx) => {
      if (!input.isPartialSync) {
        const existingTemplates = await tx
          .select({
            id: messengerMessageTemplateModel.id,
            sourceId: messengerMessageTemplateModel.sourceId,
          })
          .from(messengerMessageTemplateModel)
          .where(
            eq(
              messengerMessageTemplateModel.integrationMessengerId,
              input.integrationMessengerId,
            ),
          )

        const incomingSourceIds = new Set(
          input.templates.map((template) => template.id),
        )

        const templatesToDelete = existingTemplates.filter(
          (template) => !incomingSourceIds.has(template.sourceId),
        )

        if (templatesToDelete.length > 0) {
          await tx.delete(messengerMessageTemplateModel).where(
            inArray(
              messengerMessageTemplateModel.id,
              templatesToDelete.map((template) => template.id),
            ),
          )
        }
      }

      for (const template of input.templates) {
        await tx
          .insert(messengerMessageTemplateModel)
          .values([
            {
              id: createId(),
              name: template.name,
              integrationMessengerId: input.integrationMessengerId,
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

export const messengerIntegrationService = new MessengerIntegrationService()
