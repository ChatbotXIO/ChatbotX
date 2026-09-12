import {
  and,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
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
import { notFoundException, validationException } from "../errors"
import { flowService } from "../flow/service"

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

type UpdateQrCodeData = Partial<CreateQrCodeData>

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

class QRCodeService extends BaseService {
  // Deliberately uncached: this is also read by the public, unauthenticated
  // `/l/[workspaceId]/[id]` QR landing page, whose whole job is to redirect a
  // freshly scanned code to the right inbox link. Caching here (as `list`
  // does) would let a renamed/re-pointed QR code route scans to the old
  // destination for up to `QR_CODES_CACHE_TTL_SECONDS`. The authenticated
  // builder edit page gets its own cache in `findQrCode`
  // (apps/builder/src/features/qr-codes/queries/index.ts) instead.
  async find({ workspaceId, id }: { workspaceId: string; id: string }) {
    return await db.query.reflinkModel.findFirst({
      where: {
        id,
        workspaceId,
        type: "qrCode",
      },
    })
  }

  async findOrFail({ workspaceId, id }: { workspaceId: string; id: string }) {
    const qrCode = await this.find({ workspaceId, id })
    if (!qrCode) {
      throw notFoundException("QR Code not found")
    }
    return qrCode
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

    if (
      rest.flowId &&
      !(await flowService.exists(workspaceId, rest.flowId, tx))
    ) {
      throw validationException("flowId", "Flow not found in this workspace")
    }

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

  async update(input: {
    workspaceId: string
    id: string
    data: UpdateQrCodeData
    duplicateNameMessage: string
    tx?: DatabaseClient
  }): Promise<ReflinkModel> {
    const { tx = db, workspaceId, id, data, duplicateNameMessage } = input
    const qrCode = await this.findOrFail({ workspaceId, id })
    const { size, name, ...rest } = data
    const qrStyles =
      size === undefined
        ? undefined
        : { ...((qrCode.qrStyles as { size: number } | null) ?? {}), size }

    if (
      rest.flowId &&
      !(await flowService.exists(workspaceId, rest.flowId, tx))
    ) {
      throw validationException("flowId", "Flow not found in this workspace")
    }

    try {
      const [updated] = await tx
        .update(reflinkModel)
        .set({
          ...rest,
          ...(name === undefined ? {} : { name: `qr_${name}` }),
          ...(qrStyles === undefined ? {} : { qrStyles }),
        })
        .where(
          and(
            eq(reflinkModel.id, qrCode.id),
            eq(reflinkModel.workspaceId, workspaceId),
            eq(reflinkModel.type, "qrCode"),
          ),
        )
        .returning()

      await this.invalidateCacheTags(qrCodeWorkspaceCacheTag(workspaceId))

      return updated
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", duplicateNameMessage)
      }
      throw error
    }
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db, workspaceId, ids } = input
    await tx
      .delete(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, workspaceId),
          eq(reflinkModel.type, "qrCode"),
          inArray(reflinkModel.id, ids),
        ),
      )

    await this.invalidateCacheTags(qrCodeWorkspaceCacheTag(workspaceId))
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
