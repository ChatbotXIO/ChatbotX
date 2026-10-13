import type { PassThrough } from "node:stream"
import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { fileStatuses } from "@chatbotx.io/database/partials"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import type { JobExportLeaderboardParticipants } from "@chatbotx.io/worker-config"

type ExportData = JobExportLeaderboardParticipants["data"]

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/
const NEWLINE_RE = /\r?\n/g
const QUOTE_RE = /"/g
const PAGE_SIZE = 1000
const MAX_EXPORT_ROWS = 500_000

/** CSV-escapes a cell and neutralizes spreadsheet formulas (same rules as the coupon export). */
const escapeCsvValue = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value)
  if (!text) {
    return '""'
  }
  const normalized = text.replace(NEWLINE_RE, " ")
  const guarded = FORMULA_PREFIX_RE.test(normalized)
    ? `'${normalized}`
    : normalized
  return `"${guarded.replace(QUOTE_RE, '""')}"`
}

const writeToStream = (stream: PassThrough, chunk: string): Promise<void> =>
  new Promise((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })

const formatBreakdown = (breakdown: Record<string, number>): string =>
  Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}: ${count}`)
    .join("; ")

/**
 * Streams every participant of a leaderboard to CSV in ranking order (banned
 * last, with an empty rank) and marks the File row uploaded/failed.
 */
export const exportLeaderboardParticipants = async (
  data: ExportData,
): Promise<void> => {
  const { stream, done } = createUpload(data.outputPath, {
    contentType: "text/csv; charset=utf-8",
  })
  let totalBytes = 0
  let totalRecords = 0

  const fail = async () => {
    await leaderboardService.updateExportFile({
      workspaceId: data.workspaceId,
      fileId: data.fileId,
      values: { status: fileStatuses.enum.failed, meta: { totalRecords } },
    })
  }

  try {
    const withContactInfo = data.includeContactInfo === true
    const header = [
      "Rank",
      "Contact ID",
      "Name",
      ...(withContactInfo ? ["Phone", "Email"] : []),
      "Score",
      "Banned",
      "Breakdown",
      "Joined at",
      "Last activity",
    ]
      .map(escapeCsvValue)
      .join(",")
      .concat("\n")
    await writeToStream(stream, header)
    totalBytes += Buffer.byteLength(header)

    let rank = 0
    for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += PAGE_SIZE) {
      const rows = await leaderboardService.exportPage({
        leaderboardId: data.leaderboardId,
        limit: PAGE_SIZE,
        offset,
      })
      for (const row of rows) {
        if (!row.isBanned) {
          rank += 1
        }
        const line = [
          row.isBanned ? "" : rank,
          row.contactId,
          row.fullName,
          ...(withContactInfo ? [row.phoneNumber, row.email] : []),
          row.score,
          row.isBanned ? "yes" : "no",
          formatBreakdown(row.breakdown ?? {}),
          new Date(row.createdAt).toISOString(),
          new Date(row.lastActivityAt).toISOString(),
        ]
          .map(escapeCsvValue)
          .join(",")
          .concat("\n")
        await writeToStream(stream, line)
        totalBytes += Buffer.byteLength(line)
        totalRecords += 1
      }
      if (rows.length < PAGE_SIZE) {
        break
      }
    }

    stream.end()
    await done
    await leaderboardService.updateExportFile({
      workspaceId: data.workspaceId,
      fileId: data.fileId,
      values: {
        status: fileStatuses.enum.uploaded,
        fileSize: String(totalBytes),
        meta: { totalRecords },
        uploadedAt: new Date(),
      },
    })
  } catch (error) {
    stream.destroy()
    await done.catch(() => undefined)
    await fail()
    throw error
  }
}
