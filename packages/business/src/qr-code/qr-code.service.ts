import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { flowModel, reflinkModel } from "@chatbotx.io/database/schema"
import type { FlowModel, ReflinkModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { validationException } from "../errors"

const QR_CODES_CACHE_TTL_SECONDS = 60 * 60

export function qrCodeWorkspaceCacheTag(workspaceId: string): string {
  return `workspaces:${workspaceId}#qr-codes`
}

type ListQrCodesInput = {
  workspaceId: string
  page?: number | null
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string | null
}

type ListQrCodesRow = Pick<
  ReflinkModel,
  | "id"
  | "name"
  | "type"
  | "flowId"
  | "workspaceId"
  | "customFieldId"
  | "qrStyles"
  | "createdAt"
  | "updatedAt"
> & {
  flow: Pick<
    FlowModel,
    | "id"
    | "name"
    | "active"
    | "enableInInbox"
    | "currentVersionId"
    | "draftVersionId"
    | "workspaceId"
    | "folderId"
    | "createdAt"
    | "updatedAt"
  >
}

type ListQrCodesResult = {
  data: ListQrCodesRow[]
  pageCount: number
}

type CreateQrCodeData = Omit<
  typeof reflinkModel.$inferInsert,
  "id" | "workspaceId" | "type" | "name" | "qrStyles"
> & {
  size: number
  name: string
}

function getListCacheKey(input: ListQrCodesInput): string {
  const parts: Record<string, string | number | null | undefined> = {
    workspaceId: input.workspaceId,
    page: input.page,
    perPage: input.perPage,
    sort: JSON.stringify(input.sort),
    keyword: input.keyword,
  }
  const keyParts = Object.keys(parts)
    .filter((key) => parts[key] !== undefined)
    .sort()
    .map((key) => `${key}:${parts[key]}`)
    .join(":")
  return `qr-codes:list:${keyParts}`
}

function getItemCacheKey(workspaceId: string, id: string): string {
  return `qr-codes:item:${workspaceId}:${id}`
}

class QRCodeService extends BaseService {
  async find({ workspaceId, id }: { workspaceId: string; id: string }) {
    return await withCache(
      getItemCacheKey(workspaceId, id),
      async () =>
        await db.query.reflinkModel.findFirst({
          where: {
            id,
            workspaceId,
            type: "qrCode",
          },
        }),
      {
        ttl: QR_CODES_CACHE_TTL_SECONDS,
        tags: [qrCodeWorkspaceCacheTag(workspaceId)],
      },
    )
  }

  async create(input: {
    workspaceId: string
    data: CreateQrCodeData
    duplicateNameMessage: string
    tx?: DatabaseClient
  }): Promise<{ id: string }> {
    const { tx = db, workspaceId, data, duplicateNameMessage } = input
    const { size, name, ...rest } = data
    const id = createId()
    try {
      await tx.insert(reflinkModel).values({
        id,
        workspaceId,
        type: "qrCode",
        ...rest,
        name: `qr_${name}`,
        qrStyles: { size },
      })

      await this.invalidateCacheTags(qrCodeWorkspaceCacheTag(workspaceId))

      return { id }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", duplicateNameMessage)
      }
      throw error
    }
  }

  async list(input: ListQrCodesInput): Promise<ListQrCodesResult> {
    return await withCache(
      getListCacheKey(input),
      async () => {
        const whereSQL = and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          eq(reflinkModel.type, "qrCode"),
          input.keyword
            ? ilike(reflinkModel.name, likeContains(input.keyword))
            : undefined,
        )

        const pagination = getPaginationWithDefaults(input)
        const orderBy = parseOrderBy(reflinkModel, {
          sort: input.sort ?? undefined,
        })

        const [rows, totalRows] = await Promise.all([
          db
            .select({
              id: reflinkModel.id,
              name: reflinkModel.name,
              type: reflinkModel.type,
              flowId: reflinkModel.flowId,
              workspaceId: reflinkModel.workspaceId,
              customFieldId: reflinkModel.customFieldId,
              qrStyles: reflinkModel.qrStyles,
              createdAt: reflinkModel.createdAt,
              updatedAt: reflinkModel.updatedAt,
              flow: {
                id: flowModel.id,
                name: flowModel.name,
                active: flowModel.active,
                enableInInbox: flowModel.enableInInbox,
                currentVersionId: flowModel.currentVersionId,
                draftVersionId: flowModel.draftVersionId,
                workspaceId: flowModel.workspaceId,
                folderId: flowModel.folderId,
                createdAt: flowModel.createdAt,
                updatedAt: flowModel.updatedAt,
              },
            })
            .from(reflinkModel)
            .innerJoin(flowModel, eq(reflinkModel.flowId, flowModel.id))
            .where(whereSQL)
            .orderBy(...orderBy)
            .limit(pagination.limit)
            .offset(pagination.offset),
          db.$count(reflinkModel, whereSQL),
        ])

        return { data: rows, pageCount: Math.ceil(totalRows / input.perPage) }
      },
      {
        ttl: QR_CODES_CACHE_TTL_SECONDS,
        tags: [qrCodeWorkspaceCacheTag(input.workspaceId)],
      },
    )
  }
}

export const qrCodeService = new QRCodeService()
