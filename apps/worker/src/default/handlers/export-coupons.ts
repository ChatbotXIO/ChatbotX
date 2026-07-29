import type { PassThrough } from "node:stream"
import { couponService } from "@chatbotx.io/business"
import {
  couponIssueStatuses,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { couponRepository } from "@chatbotx.io/database/repositories"
import { chunkById } from "@chatbotx.io/database/utils"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import {
  type JobExportCoupons,
  loopableItemsCount,
} from "@chatbotx.io/worker-config"

type ExportData = JobExportCoupons["data"]

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/

const escapeCsvValue = (value: string): string => {
  if (!value) {
    return '""'
  }
  const normalized = value.replace(/\r?\n/g, " ")
  const guarded = FORMULA_PREFIX_RE.test(normalized)
    ? `'${normalized}`
    : normalized
  return `"${guarded.replace(/"/g, '""')}"`
}

const writeToStream = (stream: PassThrough, chunk: string): Promise<void> =>
  new Promise((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })

const renderIssueStatus = (
  status: (typeof couponIssueStatuses.enum)[keyof typeof couponIssueStatuses.enum],
) =>
  status === couponIssueStatuses.enum.published ? "Published" : "Unpublished"

const MAX_EXPORT_ROWS = 500_000

export const exportCoupons = async (data: ExportData): Promise<void> => {
  if (data.outputFormat !== "csv") {
    return
  }

  const filter = data.filter ?? {}
  const { stream, done } = createUpload(data.outputPath, {
    contentType: "text/csv; charset=utf-8",
  })

  let totalBytes = 0
  let totalRecords = 0

  try {
    const header = ["Name", "Code", "Used", "Date"]
      .map(escapeCsvValue)
      .join(",")
      .concat("\n")
    await writeToStream(stream, header)
    totalBytes += Buffer.byteLength(header)

    let hitRowCap = false
    await chunkById(
      (lastId) =>
        couponService.listCouponsForExportPage({
          workspaceId: data.workspaceId,
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
          for (const row of rows) {
            const line = [
              row.topicName,
              row.code,
              renderIssueStatus(row.issueStatus),
              row.createdAt.toISOString(),
            ]
              .map(escapeCsvValue)
              .join(",")
              .concat("\n")
            await writeToStream(stream, line)
            totalBytes += Buffer.byteLength(line)
            totalRecords += 1

            if (totalRecords >= MAX_EXPORT_ROWS) {
              hitRowCap = true
              break
            }
          }

          await couponRepository.updateExportFile({
            fileId: data.fileId,
            workspaceId: data.workspaceId,
            meta: { totalRecords },
          })
          if (hitRowCap) {
            return false
          }
          return
        },
      },
    )

    if (hitRowCap) {
      stream.end()
      await done
      await couponRepository.updateExportFile({
        fileId: data.fileId,
        workspaceId: data.workspaceId,
        status: fileStatuses.enum.failed,
        meta: { totalRecords },
      })
      throw new Error(
        `Export exceeded the ${MAX_EXPORT_ROWS.toLocaleString()}-row limit.`,
      )
    }

    stream.end()
    await done

    const finalStatus =
      totalRecords === 0 ? fileStatuses.enum.failed : fileStatuses.enum.uploaded

    await couponRepository.updateExportFile({
      fileId: data.fileId,
      workspaceId: data.workspaceId,
      status: finalStatus,
      fileSize: String(totalBytes),
      meta: { totalRecords },
      uploadedAt:
        finalStatus === fileStatuses.enum.uploaded ? new Date() : undefined,
    })
  } catch (error) {
    stream.destroy()
    await done.catch(() => undefined)
    await couponRepository.updateExportFile({
      fileId: data.fileId,
      workspaceId: data.workspaceId,
      status: fileStatuses.enum.failed,
      meta: { totalRecords },
    })
    throw error
  }
}
