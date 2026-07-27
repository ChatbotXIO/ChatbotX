import type { PassThrough } from "node:stream"
import { couponService } from "@chatbotx.io/business"
import {
  couponIssueStatuses,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { couponRepository } from "@chatbotx.io/database/repositories"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import type { JobExportCoupons } from "@chatbotx.io/worker-config"

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

export const exportCoupons = async (data: ExportData): Promise<void> => {
  if (data.outputFormat !== "csv") {
    return
  }

  const { stream, done } = createUpload(data.outputPath, {
    contentType: "text/csv; charset=utf-8",
  })

  let totalBytes = 0
  let totalRecords = 0

  try {
    const rows = await couponService.listCouponsForExport({
      workspaceId: data.workspaceId,
      ...data.filter,
    })
    const header = ["Name", "Code", "Used", "Date"]
      .map(escapeCsvValue)
      .join(",")
      .concat("\n")
    await writeToStream(stream, header)
    totalBytes += Buffer.byteLength(header)

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
    }

    stream.end()
    await done

    await couponRepository.updateExportFile({
      fileId: data.fileId,
      status: fileStatuses.enum.uploaded,
      fileSize: String(totalBytes),
      meta: { totalRecords },
      uploadedAt: new Date(),
    })
  } catch (error) {
    stream.destroy()
    await done.catch(() => undefined)
    await couponRepository.updateExportFile({
      fileId: data.fileId,
      status: fileStatuses.enum.failed,
      meta: { totalRecords },
    })
    throw error
  }
}
