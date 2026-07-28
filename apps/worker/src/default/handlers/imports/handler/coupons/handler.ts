import { couponService } from "@chatbotx.io/business"
import {
  type CouponImportMeta,
  couponImportMetaSchema,
  couponTopicStatuses,
} from "@chatbotx.io/database/partials"
import { logger } from "../../../../../lib/logger"
import type {
  BatchResult,
  ImportPrepareResult,
  ImportRow,
  ImportTypeHandler,
} from "../../base-import"
import { type CouponImportRow, extractCouponRow } from "./extractor"

type CouponDeps = {
  topicId: string
}

const prepareCoupons = async ({
  row,
  meta,
}: {
  row: ImportRow
  meta: CouponImportMeta
}): Promise<ImportPrepareResult<CouponDeps>> => {
  const topic = await couponService.getTopic({
    workspaceId: row.workspaceId,
    topicId: meta.topicId,
  })

  if (topic.status !== couponTopicStatuses.enum.active) {
    return { ok: false, reason: "Coupon topic is not active" }
  }

  return { ok: true, deps: { topicId: topic.id } }
}

const processCouponBatch = async (
  deps: CouponDeps,
  rows: CouponImportRow[],
  ctx: { row: ImportRow; meta: CouponImportMeta },
): Promise<BatchResult> => {
  const total = rows.length
  const codes = Array.from(new Set(rows.map((row) => row.code)))

  try {
    const result = await couponService.importBatch({
      workspaceId: ctx.row.workspaceId,
      topicId: deps.topicId,
      codes,
    })
    return {
      success: result.created,
      failed: total - result.created,
    }
  } catch (error) {
    logger.error({ err: error }, "Import coupon batch failed")
    return { success: 0, failed: total }
  }
}

export const couponsImportHandler: ImportTypeHandler<
  CouponImportMeta,
  CouponDeps,
  CouponImportRow
> = {
  type: "coupons",
  parseMeta: (raw) => couponImportMetaSchema.parse(raw),
  prepare: prepareCoupons,
  processRow: (_deps, rawRow) => extractCouponRow(rawRow),
  processBatch: processCouponBatch,
}
