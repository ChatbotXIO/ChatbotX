import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { emailTopicModel } from "@chatbotx.io/database/schema"
import type { EmailTopicModel } from "@chatbotx.io/database/types"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { ChatbotXException } from "../errors"
import { folderService } from "../folder/service"
import type { PaginatedResult } from "../types"

type ListEmailTopicsInput = {
  workspaceId: string
  folderId?: string | null
  name?: string | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

type CreateEmailTopicData = {
  name: string
  folderId?: string | null
}

type UpdateEmailTopicData = {
  name: string
}

class EmailTopicService {
  async list(
    input: ListEmailTopicsInput,
  ): Promise<PaginatedResult<EmailTopicModel>> {
    const where = {
      workspaceId: input.workspaceId,
      folderId: input.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          input.folderId === rootFolderId
          ? { isNull: true as const }
          : input.folderId
        : undefined,
      name: input.name ? { ilike: `%${input.name.toLowerCase()}%` } : undefined,
    }

    const orderBy = parseOrderByAsObject(emailTopicModel, input)
    const pagination = parsePagination(input)

    const [data, total] = await Promise.all([
      db.query.emailTopicModel.findMany({ where, orderBy, ...pagination }),
      db.$count(emailTopicModel, relationsFilterToSQL(emailTopicModel, where)),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(total / pagination.limit)
      : 1

    return { data, pageCount }
  }

  async create(props: {
    workspaceId: string
    data: CreateEmailTopicData
    tx?: DatabaseClient
  }): Promise<EmailTopicModel> {
    const { workspaceId, data, tx = db } = props

    const existing = await tx.query.emailTopicModel.findFirst({
      columns: { id: true },
      where: { name: data.name, workspaceId },
    })
    if (existing) {
      throw new ChatbotXException("Name is already taken.", "nameTaken", 400)
    }

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "emailTopic",
      })
    }

    const [topic] = await tx
      .insert(emailTopicModel)
      .values({
        id: createId(),
        workspaceId,
        ...data,
        folderId: data.folderId ?? null,
      })
      .returning()

    return topic
  }

  async update(props: {
    workspaceId: string
    id: string
    data: UpdateEmailTopicData
    tx?: DatabaseClient
  }): Promise<EmailTopicModel> {
    const { workspaceId, id, data, tx = db } = props

    const existing = await tx.query.emailTopicModel.findFirst({
      columns: { id: true },
      where: { name: data.name, workspaceId, id: { ne: id } },
    })
    if (existing) {
      throw new ChatbotXException("Name is already taken.", "nameTaken", 400)
    }

    const [updated] = await tx
      .update(emailTopicModel)
      .set({ name: data.name })
      .where(
        and(
          eq(emailTopicModel.id, id),
          eq(emailTopicModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    return updated
  }

  async delete(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, ids, tx = db } = props

    await tx
      .delete(emailTopicModel)
      .where(
        and(
          eq(emailTopicModel.workspaceId, workspaceId),
          inArray(emailTopicModel.id, ids),
        ),
      )
  }
}

export const emailTopicService = new EmailTopicService()
