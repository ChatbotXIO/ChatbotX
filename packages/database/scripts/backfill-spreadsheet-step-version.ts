/**
 * Tags legacy Google Sheets write steps with version "v1".
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database backfill:spreadsheet-step-version -- --dry-run
 *   pnpm --filter @chatbotx.io/database backfill:spreadsheet-step-version
 *
 * This script never converts customFieldId mappings to variable templates.
 */
import { tagNodeSpreadsheetWriteStepVersions } from "@chatbotx.io/flow-config"
import { asc, eq, gt } from "drizzle-orm"
import { db } from "../src/client"
import { flowVersionModel } from "../src/schema/flow-version"

const isDryRun = process.argv.includes("--dry-run")
// Keyset-paginate by id so a large FlowVersion table is never fully materialised.
const BATCH_SIZE = 500

type TaggableNodeDetails = Parameters<
  typeof tagNodeSpreadsheetWriteStepVersions
>[0]
type FlowVersionNodes = (typeof flowVersionModel.$inferSelect)["nodes"]

const tagNodes = (nodes: FlowVersionNodes): FlowVersionNodes =>
  nodes.map((node) => {
    if (!(node.data && typeof node.data === "object")) {
      return node
    }

    const data = node.data as Record<string, unknown> & {
      details?: TaggableNodeDetails
    }
    if (data.details === undefined) {
      return node
    }

    return {
      ...node,
      data: {
        ...data,
        details: tagNodeSpreadsheetWriteStepVersions(data.details),
      },
    }
  })

const main = async (): Promise<void> => {
  let cursor: string | null = null
  let scanned = 0
  let changed = 0

  for (;;) {
    const rows = await db
      .select({ id: flowVersionModel.id, nodes: flowVersionModel.nodes })
      .from(flowVersionModel)
      .where(cursor === null ? undefined : gt(flowVersionModel.id, cursor))
      .orderBy(asc(flowVersionModel.id))
      .limit(BATCH_SIZE)

    if (rows.length === 0) {
      break
    }
    cursor = rows.at(-1)?.id ?? null
    scanned += rows.length

    for (const row of rows) {
      const taggedNodes = tagNodes(row.nodes)

      if (JSON.stringify(taggedNodes) === JSON.stringify(row.nodes)) {
        continue
      }

      changed++

      if (isDryRun) {
        continue
      }

      await db
        .update(flowVersionModel)
        .set({ nodes: taggedNodes })
        .where(eq(flowVersionModel.id, row.id))
    }
  }

  console.log(
    isDryRun
      ? `Dry run: ${changed} of ${scanned} flow versions would be tagged.`
      : `Tagged ${changed} of ${scanned} flow versions.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Spreadsheet step version backfill failed:", error)
    process.exit(1)
  })
