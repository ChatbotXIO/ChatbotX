import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import {
  integrationWhatsappModel,
  whatsappFlowModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

/** WhatsApp's flow shape, as returned by `listFlows`. */
export type MetaWhatsappFlow = {
  id: string
  name: string
  status: string
  categories: unknown
  validation_errors: unknown
}

class WhatsappFlowService extends BaseService {
  list(props: {
    tx?: DatabaseClient
    where: {
      workspaceId: string
      inboxId?: string
      integrationWhatsappId?: string
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

    return tx.query.whatsappFlowModel.findMany({
      where: queryWhere,
      with: {
        integrationWhatsapp: true,
      },
      orderBy: { createdAt: "asc" },
    })
  }

  findByIdUnscoped(id: string) {
    return findOrFail({
      table: whatsappFlowModel,
      where: { id },
      message: "Whatsapp flow not found",
    })
  }

  /** Meta's id for a workspace Flow, or undefined when the Flow is gone. */
  async findSourceId(props: {
    id: string
    workspaceId: string
  }): Promise<string | undefined> {
    const row = await db.query.whatsappFlowModel.findFirst({
      where: {
        id: props.id,
        integrationWhatsapp: { workspaceId: props.workspaceId },
      },
      columns: { sourceId: true },
    })
    return row?.sourceId || undefined
  }

  /** Inserts or refreshes a single Flow, e.g. right after publishing a Mini App. */
  async upsertFromMeta(props: {
    integrationWhatsappId: string
    flow: MetaWhatsappFlow
  }): Promise<{ id: string }> {
    const values = {
      name: props.flow.name,
      status: props.flow.status,
      categories: props.flow.categories ?? [],
      validationErrors: props.flow.validation_errors ?? [],
    }
    const [row] = await db
      .insert(whatsappFlowModel)
      .values({
        id: createId(),
        integrationWhatsappId: props.integrationWhatsappId,
        sourceId: props.flow.id,
        completedCount: "0",
        screens: [],
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          whatsappFlowModel.integrationWhatsappId,
          whatsappFlowModel.sourceId,
        ],
        set: values,
      })
      .returning({ id: whatsappFlowModel.id })
    return row as { id: string }
  }

  async syncFromMeta(props: {
    integrationWhatsappId: string
    flows: MetaWhatsappFlow[]
  }): Promise<void> {
    await db.transaction(async (tx) => {
      const existingFlows = await tx
        .select({
          id: whatsappFlowModel.id,
          sourceId: whatsappFlowModel.sourceId,
        })
        .from(whatsappFlowModel)
        .where(
          eq(
            whatsappFlowModel.integrationWhatsappId,
            props.integrationWhatsappId,
          ),
        )

      const incomingSourceIds = new Set(props.flows.map((f) => f.id))

      const flowsToDelete = existingFlows.filter(
        (f) => !incomingSourceIds.has(f.sourceId),
      )

      if (flowsToDelete.length > 0) {
        await tx.delete(whatsappFlowModel).where(
          inArray(
            whatsappFlowModel.id,
            flowsToDelete.map((f) => f.id),
          ),
        )
      }

      for (const flow of props.flows) {
        const existing = existingFlows.find((f) => f.sourceId === flow.id)

        if (existing) {
          await tx
            .update(whatsappFlowModel)
            .set({
              name: flow.name,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
            })
            .where(eq(whatsappFlowModel.id, existing.id))
        } else {
          await tx.insert(whatsappFlowModel).values([
            {
              id: createId(),
              name: flow.name,
              integrationWhatsappId: props.integrationWhatsappId,
              sourceId: flow.id,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
              completedCount: "0",
            },
          ])
        }
      }
    })
  }

  /**
   * Mirrors a Flow just deleted or deprecated on Meta into every number of
   * the workspace that synced it (Flows belong to the WABA, so several
   * numbers can hold a copy). A deprecated Flow keeps its row: customers can
   * still answer it from their phones and those answers count into
   * `completedCount`. Pickers only list PUBLISHED Flows, so it disappears
   * from them either way.
   */
  async markRemovedOnMeta(props: {
    workspaceId: string
    sourceId: string
    /** Meta's status afterwards; null when the Flow no longer exists. */
    status: string | null
  }): Promise<void> {
    const workspaceNumbers = db
      .select({ id: integrationWhatsappModel.id })
      .from(integrationWhatsappModel)
      .where(eq(integrationWhatsappModel.workspaceId, props.workspaceId))
    const where = and(
      eq(whatsappFlowModel.sourceId, props.sourceId),
      inArray(whatsappFlowModel.integrationWhatsappId, workspaceNumbers),
    )
    if (props.status === null) {
      await db.delete(whatsappFlowModel).where(where)
      return
    }
    await db
      .update(whatsappFlowModel)
      .set({ status: props.status })
      .where(where)
  }
}

export const whatsappFlowService = new WhatsappFlowService()
