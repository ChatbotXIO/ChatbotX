import {
  and,
  type DatabaseClient,
  db,
  eq,
  isUniqueViolationError,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { magicLinkModel } from "@chatbotx.io/database/schema"
import type { MagicLinkModel } from "@chatbotx.io/database/types"
import {
  deleteByIdsInWorkspace,
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"

type CreateMagicLinkData = Omit<
  typeof magicLinkModel.$inferInsert,
  "id" | "workspaceId"
>

type UpdateMagicLinkData = Partial<CreateMagicLinkData>

type ListMagicLinksInput = {
  workspaceId: string
  page?: number | null
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string | null
}

type ListMagicLinksResult = {
  data: MagicLinkModel[]
  pageCount: number
}

class MagicLinkService extends BaseService {
  async create(input: {
    workspaceId: string
    data: CreateMagicLinkData
    tx?: DatabaseClient
  }): Promise<MagicLinkModel> {
    const { tx = db, workspaceId, data } = input
    try {
      return await this.insertInTx(tx, { workspaceId, data })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  /**
   * The insert core, shared with the template install so there is one
   * implementation. A taken name surfaces as the raw unique violation: `create`
   * maps it to a validation error, the install retries with a `-copy` name.
   */
  async insertInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; data: CreateMagicLinkData },
  ): Promise<MagicLinkModel> {
    const [created] = await tx
      .insert(magicLinkModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.data,
      })
      .returning()
    return created
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<MagicLinkModel> {
    const link = await this.findByWorkspace(input)
    if (!link) {
      throw notFoundException("Magic link not found")
    }
    return link
  }

  async update(input: {
    workspaceId: string
    id: string
    data: UpdateMagicLinkData
  }): Promise<MagicLinkModel> {
    try {
      // The row is locked before it is read, so the diff that decides the
      // View-only guard is computed under the lock.
      return await withTemplateLockedTransaction(
        async (tx) => {
          const link = await tx.query.magicLinkModel.findFirst({
            where: { id: input.id, workspaceId: input.workspaceId },
          })
          if (!link) {
            throw notFoundException("Magic link not found")
          }
          await assertResourceEditable({
            workspaceId: input.workspaceId,
            resourceKind: "magicLink",
            resourceIds: [link.id],
            changedKeys: changedKeysOf(link, input.data),
            tx,
          })
          const [updated] = await tx
            .update(magicLinkModel)
            .set(input.data)
            .where(
              and(
                eq(magicLinkModel.id, link.id),
                eq(magicLinkModel.workspaceId, input.workspaceId),
              ),
            )
            .returning()
          return updated
        },
        {
          workspaceId: input.workspaceId,
          initialKeys: [{ kind: "magicLink", resourceId: input.id }],
        },
      )
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.findOrFail(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }

  async deleteMany(input: { workspaceId: string; ids: string[] }) {
    if (input.ids.length === 0) {
      return
    }
    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "magicLink", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, input),
    )
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. Returns the ids deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    return await deleteByIdsInWorkspace(tx, magicLinkModel, input)
  }

  async list(input: ListMagicLinksInput): Promise<ListMagicLinksResult> {
    const where = {
      workspaceId: input.workspaceId,
      ...(input.keyword
        ? {
            OR: [
              { name: { ilike: likeContains(input.keyword) } },
              { url: { ilike: likeContains(input.keyword) } },
            ],
          }
        : {}),
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(magicLinkModel, input)

    const [data, totalRows] = await Promise.all([
      db.query.magicLinkModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(magicLinkModel, relationsFilterToSQL(magicLinkModel, where)),
    ])

    const pageCount = Math.ceil(totalRows / input.perPage)

    return { data, pageCount }
  }

  async findByWorkspace(input: {
    workspaceId: string
    id: string
  }): Promise<MagicLinkModel | undefined> {
    return await db.query.magicLinkModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
    })
  }

  async findByName(input: {
    workspaceId: string
    name: string
  }): Promise<MagicLinkModel | undefined> {
    return await db.query.magicLinkModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        name: input.name,
      },
    })
  }
}

export const magicLinkService = new MagicLinkService()
