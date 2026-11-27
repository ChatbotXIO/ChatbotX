import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { fileStatuses } from "@chatbotx.io/database/partials"
import { createUpload } from "@chatbotx.io/filesystem/node-upload"
import { toUploadWriter } from "@chatbotx.io/filesystem/upload-writer"
import { type CsvCell, toCsvRow, UTF8_BOM } from "@chatbotx.io/utils/csv"
import type { JobExportLeaderboardParticipants } from "@chatbotx.io/worker-config"

type ExportData = JobExportLeaderboardParticipants["data"]
type ParticipantRow = Awaited<
  ReturnType<typeof leaderboardService.exportPage>
>[number]

const PAGE_SIZE = 1000
const MAX_EXPORT_ROWS = 500_000

const formatBreakdown = (breakdown: Record<string, number>): string =>
  Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}: ${count}`)
    .join("; ")

const buildHeader = (withContactInfo: boolean): string[] => [
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

/** Banned participants have no rank (`null` → empty cell). */
const buildCells = (
  row: ParticipantRow,
  rank: number | null,
  withContactInfo: boolean,
): CsvCell[] => [
  rank,
  row.contactId,
  row.fullName,
  ...(withContactInfo ? [row.phoneNumber, row.email] : []),
  row.score,
  row.isBanned ? "yes" : "no",
  formatBreakdown(row.breakdown ?? {}),
  new Date(row.createdAt).toISOString(),
  new Date(row.lastActivityAt).toISOString(),
]

/**
 * Streams every participant of a leaderboard to CSV in ranking order (banned
 * last, with an empty rank) and marks the File row uploaded/failed.
 */
export const exportLeaderboardParticipants = async (
  data: ExportData,
): Promise<void> => {
  const { workspaceId, fileId } = data
  const withContactInfo = data.includeContactInfo === true
  const upload = toUploadWriter(
    createUpload(data.outputPath, { contentType: "text/csv; charset=utf-8" }),
  )
  let totalRecords = 0

  try {
    await upload.write(`${UTF8_BOM}${toCsvRow(buildHeader(withContactInfo))}`)

    let rank = 0
    for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += PAGE_SIZE) {
      const rows = await leaderboardService.exportPage({
        leaderboardId: data.leaderboardId,
        limit: PAGE_SIZE,
        offset,
      })
      let chunk = ""
      for (const row of rows) {
        if (!row.isBanned) {
          rank += 1
        }
        chunk += toCsvRow(
          buildCells(row, row.isBanned ? null : rank, withContactInfo),
        )
      }
      await upload.write(chunk)
      totalRecords += rows.length
      if (rows.length < PAGE_SIZE) {
        break
      }
    }

    await upload.finish()
    await leaderboardService.updateExportFile({
      workspaceId,
      fileId,
      values: {
        status: fileStatuses.enum.uploaded,
        fileSize: String(upload.bytesWritten()),
        meta: { totalRecords },
        uploadedAt: new Date(),
      },
    })
  } catch (error) {
    await upload.abort()
    await leaderboardService.updateExportFile({
      workspaceId,
      fileId,
      values: { status: fileStatuses.enum.failed, meta: { totalRecords } },
    })
    throw error
  }
}
