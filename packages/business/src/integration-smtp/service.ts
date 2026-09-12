import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  IntegrationSmtpModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import type { IntegrationSmtpResource } from "./schema"

/**
 * Mirrors `SmtpAuthValue` from `@chatbotx.io/integration-smtp` without
 * importing that package into business (it would pull `nodemailer` +
 * `next-intl` transitively into every business consumer, including the
 * worker). Host/port resolution against `smtpHostMap` stays in the builder
 * and is passed in already resolved.
 */
type SmtpAuthInput = {
  authType: "custom"
  provider: string
  host: string
  port: number
  username: string
  password: string
}

/**
 * Every field is optional: the builder's update form submits only what the
 * user touched, and each missing value falls back to the row's current auth.
 * `host`/`port` must already be resolved against `smtpHostMap` by the caller
 * (see the note above) — this service only fills them from the stored row.
 */
export type UpdateSmtpInput = Partial<{
  provider: string
  host: string
  port: number
  username: string
  password: string
  fromAddress: string
}>

class IntegrationSmtpService extends BaseService {
  find({
    where,
  }: {
    where: Partial<{ workspaceId: string; id: string }>
  }): Promise<IntegrationSmtpModel | undefined> {
    return db.query.integrationSmtpModel.findFirst({
      where,
    })
  }

  findByIdForWorkspace(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationSmtpModel> {
    return findOrFail({
      table: integrationSmtpModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "SMTP integration not found",
    })
  }

  async listByWorkspace(
    workspaceId: string,
  ): Promise<IntegrationSmtpResource[]> {
    const data = await db.query.integrationSmtpModel.findMany({
      where: { workspaceId },
      orderBy: {
        createdAt: "desc",
      },
    })

    return data.map(({ id, name, fromAddress }) => ({
      id,
      name,
      fromAddress,
    }))
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    name: string
    fromAddress: string
    auth: SmtpAuthInput
  }): Promise<{ inbox: InboxModel; wasCreated: boolean; smtpId: string }> {
    const { workspaceId, ownerId, name, fromAddress, auth } = input

    const smtpId = createId()
    const { inbox, wasCreated } = await db.transaction(
      async (tx) =>
        await connectChannelIntegration({
          tx,
          ownerId,
          inboxData: {
            id: smtpId,
            workspaceId,
            channel: channelTypes.enum.smtp,
            name,
            sourceId: smtpId,
          },
          insertIntegration: async (inboxId) => {
            await tx.insert(integrationSmtpModel).values({
              id: smtpId,
              name,
              workspaceId,
              inboxId,
              fromAddress,
              auth,
            })
          },
        }),
    )

    if (wasCreated) {
      await this.audit("connect", `connected a new SMTP channel (#${inbox.id})`)
    }

    return { inbox, wasCreated, smtpId }
  }

  /**
   * Merges `data` over the row's stored auth, writes it, and records an audit
   * entry only when the resulting payload actually differs. Both the merge and
   * the diff live here so any future caller (public API, worker) gets them for
   * free — see `.agents/rules/data-access.md` on public and private paths
   * sharing one service method.
   */
  async update(input: {
    workspaceId: string
    id: string
    data: UpdateSmtpInput
    tx?: DatabaseClient
  }): Promise<IntegrationSmtpModel> {
    const { workspaceId, id, data, tx = db } = input

    const integration = await this.findByIdForWorkspace({ id, workspaceId })
    const currentAuth = integration.auth as SmtpAuthInput

    const auth: SmtpAuthInput = {
      authType: "custom",
      provider: data.provider ?? currentAuth.provider,
      host: data.host || currentAuth.host,
      port: data.port || currentAuth.port,
      username: data.username ?? currentAuth.username,
      password: data.password ?? currentAuth.password,
    }
    const name = data.username ?? integration.name
    const fromAddress = data.fromAddress ?? integration.fromAddress

    // Scoped by workspace as well as id: `findByIdForWorkspace` above already
    // proves ownership, but this method accepts a `workspaceId` and must
    // honour it rather than trusting every future caller to guard first.
    const [updated] = await tx
      .update(integrationSmtpModel)
      .set({ auth, name, fromAddress })
      .where(
        and(
          eq(integrationSmtpModel.id, id),
          eq(integrationSmtpModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    if (!updated) {
      throw new ChatbotXException("SMTP integration not found")
    }

    const hasChanged = !isSameJsonValue(
      { auth, name, fromAddress },
      {
        auth: currentAuth,
        name: integration.name,
        fromAddress: integration.fromAddress,
      },
    )

    if (hasChanged) {
      await this.audit("update", "updated the SMTP channel configuration")
    }

    return updated
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      await client
        .delete(integrationSmtpModel)
        .where(
          and(
            eq(integrationSmtpModel.id, id),
            eq(integrationSmtpModel.workspaceId, workspaceId),
          ),
        )

      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
        reason: "manual",
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
    } else {
      await db.transaction(run)
    }

    await this.audit("disconnect", `disconnected the SMTP channel (#${id})`)
  }
}
export const integrationSmtpService = new IntegrationSmtpService()
