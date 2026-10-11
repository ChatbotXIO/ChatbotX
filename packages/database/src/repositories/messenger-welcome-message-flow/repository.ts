import { type DatabaseClient, db, eq, inArray } from "../../client"
import { messengerWelcomeMessageFlowModel } from "../../schema"
import type { MessengerWelcomeMessageFlowModel } from "../../types"

type FlowRef = { workspaceId: string; flowId: string }

type CurrentRowInput = {
  workspaceId: string
  flowId: string
  integrationMessengerId: string
  pageId: string
  metaFlowId: string
  flowVersionId: string
}

export const messengerWelcomeMessageFlowRepository = {
  findCurrent(
    input: { flowId: string; integrationMessengerId: string },
    tx: DatabaseClient = db,
  ): Promise<MessengerWelcomeMessageFlowModel | undefined> {
    return tx.query.messengerWelcomeMessageFlowModel.findFirst({
      where: {
        flowId: input.flowId,
        integrationMessengerId: input.integrationMessengerId,
        status: "current",
      },
    })
  },

  listCurrentByFlow(
    input: FlowRef,
    tx: DatabaseClient = db,
  ): Promise<
    Pick<
      MessengerWelcomeMessageFlowModel,
      "integrationMessengerId" | "pageId" | "metaFlowId"
    >[]
  > {
    return tx.query.messengerWelcomeMessageFlowModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        flowId: input.flowId,
        status: "current",
      },
      columns: { integrationMessengerId: true, pageId: true, metaFlowId: true },
      orderBy: { createdAt: "asc" },
    })
  },

  /** Every row (current and superseded) of a flow — the delete job's input. */
  listAllByFlow(
    input: FlowRef,
    tx: DatabaseClient = db,
  ): Promise<MessengerWelcomeMessageFlowModel[]> {
    return tx.query.messengerWelcomeMessageFlowModel.findMany({
      where: { workspaceId: input.workspaceId, flowId: input.flowId },
    })
  },

  async insertCurrent(
    input: CurrentRowInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .insert(messengerWelcomeMessageFlowModel)
      .values({ ...input, status: "current" })
  },

  async setFlowVersion(
    input: { id: string; flowVersionId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(messengerWelcomeMessageFlowModel)
      .set({ flowVersionId: input.flowVersionId })
      .where(eq(messengerWelcomeMessageFlowModel.id, input.id))
  },

  async markSuperseded(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(messengerWelcomeMessageFlowModel)
      .set({ status: "superseded" })
      .where(eq(messengerWelcomeMessageFlowModel.id, input.id))
  },

  /**
   * Swaps the page's current row in one transaction: the previous row is
   * marked superseded (still used in an ad) or deleted (gone from Meta), then
   * the new one is inserted. Ordered so the partial unique index on `current`
   * holds, and atomic so a page is never left without a current row.
   */
  async replaceCurrent(
    input: {
      previous: { id: string; action: "supersede" | "delete" }
      next: CurrentRowInput
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const repository = messengerWelcomeMessageFlowRepository
    await tx.transaction(async (trx) => {
      if (input.previous.action === "supersede") {
        await repository.markSuperseded({ id: input.previous.id }, trx)
      } else {
        await repository.deleteByIds({ ids: [input.previous.id] }, trx)
      }
      await repository.insertCurrent(input.next, trx)
    })
  },

  async deleteByIds(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .delete(messengerWelcomeMessageFlowModel)
      .where(inArray(messengerWelcomeMessageFlowModel.id, input.ids))
  },
}
