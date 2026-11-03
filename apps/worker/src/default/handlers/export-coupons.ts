import { couponService } from "@chatbotx.io/business"
import {
  type CouponIssueStatus,
  couponIssueStatuses,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { couponRepository } from "@chatbotx.io/database/repositories"
import { chunkById } from "@chatbotx.io/database/utils"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import { toUploadWriter } from "@chatbotx.io/filesystem/upload-writer"
import { toCsvRow, UTF8_BOM } from "@chatbotx.io/utils/csv"
import {
  type JobExportCoupons,
  loopableItemsCount,
} from "@chatbotx.io/worker-config"

type ExportData = JobExportCoupons["data"]
type CouponExportRow = Awaited<
  ReturnType<typeof couponService.listCouponsForExportPage>
>[number]

const HEADER = ["Name", "Code", "Used", "Date"]
const MAX_EXPORT_ROWS = 500_000

const renderIssueStatus = (status: CouponIssueStatus) =>
  status === couponIssueStatuses.enum.published ? "Published" : "Unpublished"

const toCouponRow = (row: CouponExportRow): string =>
  toCsvRow([
    row.topicName,
    row.code,
    renderIssueStatus(row.issueStatus),
    row.createdAt.toISOString(),
  ])

export const exportCoupons = async (data: ExportData): Promise<void> => {
  if (data.outputFormat !== "csv") {
    return
  }

  const { workspaceId, fileId } = data
  const filter = data.filter ?? {}
  const updateFile = (
    values: Omit<
      Parameters<typeof couponRepository.updateExportFile>[0],
      "fileId" | "workspaceId"
    >,
  ) => couponRepository.updateExportFile({ fileId, workspaceId, ...values })

  const upload = toUploadWriter(
    createUpload(data.outputPath, { contentType: "text/csv; charset=utf-8" }),
  )
  let totalRecords = 0

  try {
    await upload.write(`${UTF8_BOM}${toCsvRow(HEADER)}`)

    await chunkById(
      (lastId) =>
        couponService.listCouponsForExportPage({
          workspaceId,
          filter: {
            topicId: filter.topicId,
            issueStatus: filter.issueStatus,
            usageStatus: filter.usageStatus,
            search: filter.search,
          },
          lastId,
          limit: loopableItemsCount,
        }),
      {
        chunkSize: loopableItemsCount,
        callback: async (rows): Promise<boolean | undefined> => {
          const page = rows.slice(0, MAX_EXPORT_ROWS - totalRecords)
          await upload.write(page.map(toCouponRow).join(""))
          totalRecords += page.length

          await updateFile({ meta: { totalRecords } })
          return totalRecords >= MAX_EXPORT_ROWS ? false : undefined
        },
      },
    )

    await upload.finish()

    if (totalRecords >= MAX_EXPORT_ROWS) {
      throw new Error(
        `Export exceeded the ${MAX_EXPORT_ROWS.toLocaleString()}-row limit.`,
      )
    }

    const isEmpty = totalRecords === 0
    await updateFile({
      status: isEmpty ? fileStatuses.enum.failed : fileStatuses.enum.uploaded,
      fileSize: String(upload.bytesWritten()),
      meta: { totalRecords },
      uploadedAt: isEmpty ? undefined : new Date(),
    })
  } catch (error) {
    await upload.abort()
    await updateFile({
      status: fileStatuses.enum.failed,
      meta: { totalRecords },
    })
    throw error
  }
}
