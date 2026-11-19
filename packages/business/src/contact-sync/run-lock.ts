import { type DatabaseClient, sql } from "@chatbotx.io/database/client"

/**
 * The per-workspace transaction lock every run start takes (menu or connect):
 * availability is re-read and the run inserted under it, so two requests
 * cannot both start one.
 */
export const lockWorkspaceRuns = async (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`contact-sync:${workspaceId}`}, 0))`,
  )
}
