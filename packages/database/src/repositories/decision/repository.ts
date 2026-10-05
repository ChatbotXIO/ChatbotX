import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
} from "../../client"
import type {
  DecisionConnectionStatus,
  DecisionProfileContractJson,
  DecisionProfileStatus,
  DecisionProviderKind,
} from "../../partials/decision"
import { decisionConnectionModel, decisionProfileModel } from "../../schema"
import type { DecisionConnectionModel, DecisionProfileModel } from "../../types"
import { getPaginationWithDefaults, likeContains } from "../../utils"

export type CreateDecisionConnectionInput = {
  credential: EncryptedData
  defaultModel?: string | null
  endpoint?: string | null
  id?: string
  modelCatalog: string[]
  name: string
  providerKind: DecisionProviderKind
  workspaceId: string
}

export type UpdateDecisionConnectionInput = Partial<
  Omit<CreateDecisionConnectionInput, "id" | "workspaceId">
> & {
  lastTestStatus?: "failed" | "passed" | null
  lastTestedAt?: Date | null
  status?: DecisionConnectionStatus
}

export type CreateDecisionProfileInput = {
  connectionId: string
  contract: DecisionProfileContractJson
  description?: string | null
  model: string
  name: string
  providerKind: DecisionProviderKind
  workspaceId: string
}

export type UpdateDecisionProfileInput = Partial<
  Omit<CreateDecisionProfileInput, "workspaceId">
> & {
  id: string
  status?: DecisionProfileStatus
  workspaceId: string
}

class DecisionRepository {
  async createConnection(
    input: CreateDecisionConnectionInput,
    tx: DatabaseClient = db,
  ): Promise<DecisionConnectionModel> {
    const [row] = await tx
      .insert(decisionConnectionModel)
      .values(input)
      .returning()

    return row
  }

  async findConnectionByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<DecisionConnectionModel | null> {
    return (
      (await tx.query.decisionConnectionModel.findFirst({ where: input })) ??
      null
    )
  }

  async listConnectionsByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<DecisionConnectionModel[]> {
    return await tx.query.decisionConnectionModel.findMany({
      orderBy: { createdAt: "desc" },
      where: { workspaceId },
    })
  }

  async updateConnectionForWorkspace(
    input: { id: string; workspaceId: string } & UpdateDecisionConnectionInput,
    tx: DatabaseClient = db,
  ): Promise<DecisionConnectionModel | null> {
    const { id, workspaceId, ...data } = input
    const [row] = await tx
      .update(decisionConnectionModel)
      .set(data)
      .where(
        and(
          eq(decisionConnectionModel.id, id),
          eq(decisionConnectionModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    return row ?? null
  }

  async createProfile(
    input: CreateDecisionProfileInput,
    tx: DatabaseClient = db,
  ): Promise<DecisionProfileModel> {
    const [row] = await tx
      .insert(decisionProfileModel)
      .values(input)
      .returning()

    return row
  }

  async findProfileByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<DecisionProfileModel | null> {
    return (
      (await tx.query.decisionProfileModel.findFirst({ where: input })) ?? null
    )
  }

  async listProfilesByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<DecisionProfileModel[]> {
    return await tx.query.decisionProfileModel.findMany({
      orderBy: { createdAt: "desc" },
      where: { workspaceId },
    })
  }

  async listProfilesForSettings(input: {
    name?: string
    page?: number
    perPage?: number
    sort?: { desc: boolean; id: string }[]
    workspaceId: string
  }): Promise<{
    data: Array<DecisionProfileModel & { connectionName: string | null }>
    pageCount: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const where = and(
      eq(decisionProfileModel.workspaceId, input.workspaceId),
      input.name
        ? ilike(decisionProfileModel.name, likeContains(input.name))
        : undefined,
    )
    const sort = input.sort?.[0]
    let orderBy = asc(decisionProfileModel.name)
    if (sort?.id === "status") {
      orderBy = sort.desc
        ? desc(decisionProfileModel.status)
        : asc(decisionProfileModel.status)
    } else if (sort?.desc) {
      orderBy = desc(decisionProfileModel.name)
    }

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          connectionName: decisionConnectionModel.name,
          profile: decisionProfileModel,
        })
        .from(decisionProfileModel)
        .leftJoin(
          decisionConnectionModel,
          eq(decisionProfileModel.connectionId, decisionConnectionModel.id),
        )
        .where(where)
        .orderBy(orderBy)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.$count(decisionProfileModel, where),
    ])

    return {
      data: rows.map(({ connectionName, profile }) => ({
        ...profile,
        connectionName,
      })),
      pageCount: Math.ceil(totalRows / pagination.limit),
    }
  }

  async updateProfileForWorkspace(
    input: UpdateDecisionProfileInput,
    tx: DatabaseClient = db,
  ): Promise<DecisionProfileModel | null> {
    const { id, workspaceId, ...data } = input
    const [row] = await tx
      .update(decisionProfileModel)
      .set(data)
      .where(
        and(
          eq(decisionProfileModel.id, id),
          eq(decisionProfileModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    return row ?? null
  }

  async deleteProfilesByIdsForWorkspace(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<DecisionProfileModel[]> {
    if (input.ids.length === 0) {
      return []
    }

    return await tx
      .delete(decisionProfileModel)
      .where(
        and(
          inArray(decisionProfileModel.id, input.ids),
          eq(decisionProfileModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
  }

  async listCustomFieldTypesByIds(
    input: {
      ids: string[]
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<Array<{ id: string; type: string }>> {
    if (input.ids.length === 0) {
      return []
    }

    return await tx.query.customFieldModel.findMany({
      columns: { id: true, type: true },
      where: {
        id: { in: input.ids },
        workspaceId: input.workspaceId,
      },
    })
  }
}
export const decisionRepository = new DecisionRepository()
