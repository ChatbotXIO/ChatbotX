import { and, db, eq, ilike } from "@chatbotx.io/database/client"
import { flowModel, reflinkModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListQrCodesRequest, ListQrCodesResponse } from "../schemas/query"
import type { QrCodeResource } from "../schemas/resource"

const QR_CODES_CACHE_TTL_SECONDS = 60 * 60

export function getWorkspaceCacheTag(workspaceId: string): string {
  return `workspaces:${workspaceId}#qr-codes`
}

function getListCacheKey(input: ListQrCodesRequest): string {
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

export async function listQrCodes(
  input: ListQrCodesRequest,
): Promise<ListQrCodesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await withCache(
    getListCacheKey(input),
    async () => {
      const whereSQL = and(
        eq(reflinkModel.workspaceId, input.workspaceId),
        eq(reflinkModel.type, "qrCode"),
        input.keyword
          ? ilike(reflinkModel.name, `%${input.keyword}%`)
          : undefined,
      )

      const pagination = getPaginationWithDefaults(input)
      const orderBy = parseOrderBy(reflinkModel, input)

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
      tags: [getWorkspaceCacheTag(input.workspaceId)],
    },
  )
}

export async function findQrCode(where: {
  workspaceId: string
  id: string
}): Promise<QrCodeResource | undefined> {
  return await withCache(
    getItemCacheKey(where.workspaceId, where.id),
    async () => {
      const [row] = await db
        .select()
        .from(reflinkModel)
        .where(
          and(
            eq(reflinkModel.id, where.id),
            eq(reflinkModel.workspaceId, where.workspaceId),
            eq(reflinkModel.type, "qrCode"),
          ),
        )
        .limit(1)

      return row
    },
    {
      ttl: QR_CODES_CACHE_TTL_SECONDS,
      tags: [getWorkspaceCacheTag(where.workspaceId)],
    },
  )
}
