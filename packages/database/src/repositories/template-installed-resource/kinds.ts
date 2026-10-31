import { sql } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import { logger } from "../../logger"
import {
  type TemplateResourceKind,
  templateResourceKinds,
} from "../../partials/template"

/**
 * `TemplateInstalledResource.resourceKind` is a `text` column typed to the
 * closed `templateResourceKinds` list, so a row written by a newer build (or
 * by hand) can hold a value this build does not know. Readers keep the rows
 * they can handle and log the rest, instead of crashing a whole install,
 * sync or uninstall on one unknown kind.
 *
 * Preflight before shipping a rename or removal of a kind: run
 * `pnpm --filter @chatbotx.io/database template:kinds-preflight`, which lists
 * every unknown `resourceKind` value in the database with its row count.
 */
export const keepKnownResourceKinds = <
  T extends { id: string; resourceKind: string },
>(
  rows: readonly T[],
): (T & { resourceKind: TemplateResourceKind })[] => {
  const known: (T & { resourceKind: TemplateResourceKind })[] = []
  for (const row of rows) {
    const parsed = templateResourceKinds.safeParse(row.resourceKind)
    if (!parsed.success) {
      logger.warn(
        { rowId: row.id, resourceKind: row.resourceKind },
        "Skipping a template-installed resource of an unknown kind",
      )
      continue
    }
    known.push({ ...row, resourceKind: parsed.data })
  }
  return known
}

/** Unknown `resourceKind` values in the database, with their row counts. */
export const listUnknownResourceKinds = async (
  tx: DatabaseClient = db,
): Promise<{ resourceKind: string; rows: number }[]> => {
  const result = await tx.execute<{ resourceKind: string; rows: number }>(sql`
    SELECT "resourceKind", count(*)::int AS "rows"
    FROM "TemplateInstalledResource"
    WHERE "resourceKind" NOT IN (${sql.join(
      templateResourceKinds.options.map((kind) => sql`${kind}`),
      sql`, `,
    )})
    GROUP BY 1
    ORDER BY 2 DESC
  `)
  return result.rows
}
