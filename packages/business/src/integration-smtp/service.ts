import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  IntegrationSmtpModel,
} from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
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

class IntegrationSmtpService extends BaseService {
  find({
    where,
  }: {
    where: Partial<{ workspaceId: string; id: string }>
  }): Promise<IntegrationSmtpModel | undefined> {
    // return withCache(
    //   `integrationSmtp:find:${btoa(JSON.stringify(where))}`,
    //   () =>
    return db.query.integrationSmtpModel.findFirst({
      where,
    })
    // {
    //   tags: ["integrationSmtp"],
    // },
    // )
  }

  async findByIdForWorkspace(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationSmtpModel> {
    return await findOrFail({
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
  }): Promise<{ inbox: InboxModel; wasCreated: boolean }> {
    const { workspaceId, ownerId, name, fromAddress, auth } = input

    const { inbox, wasCreated } = await db.transaction(async (tx) => {
      const smtpId = createId()

      return await connectChannelIntegration({
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
      })
    })

    return { inbox, wasCreated }
  }

  async update(input: {
    workspaceId: string
    id: string
    auth: SmtpAuthInput
    name: string
    fromAddress: string
    tx?: DatabaseClient
  }): Promise<IntegrationSmtpModel> {
    const { id, auth, name, fromAddress, tx = db } = input

    const [updated] = await tx
      .update(integrationSmtpModel)
      .set({ auth, name, fromAddress })
      .where(eq(integrationSmtpModel.id, id))
      .returning()

    if (!updated) {
      throw new ChatbotXException("SMTP integration not found")
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
        .where(eq(integrationSmtpModel.id, id))

      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
      return
    }
    await db.transaction(run)
  }
}
export const integrationSmtpService = new IntegrationSmtpService()
