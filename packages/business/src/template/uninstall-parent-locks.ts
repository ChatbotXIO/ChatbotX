import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { sql } from "drizzle-orm"

/** The table of each copied kind an uninstall can delete. */
export const UNINSTALL_PARENT_TABLE: Partial<
  Record<TemplateResourceKind, string>
> = {
  flow: "Flow",
  trigger: "Trigger",
  automatedResponse: "AutomatedResponse",
  sequence: "Sequence",
  calendar: "AppointmentCalendar",
  integrationWebchat: "IntegrationWebchat",
  fbCommentAutomation: "CommentAutomation",
  reflink: "Reflink",
  product: "Product",
  savedReply: "SavedReply",
  pipeline: "Pipeline",
  aiMcpServer: "AIMCPServer",
  aiFile: "AIFile",
  questionnaire: "Questionnaire",
  couponTopic: "CouponTopic",
  aiAgent: "AIAgent",
  aiFunction: "AIFunction",
}

/**
 * Locks the parent rows `FOR UPDATE`, tables in alphabetical order and ids
 * ascending, after the `tpl-res:` locks (so every writer orders them alike).
 * A concurrent INSERT or UPDATE of a foreign key that points at one of them
 * takes `FOR KEY SHARE` on it, which conflicts: it waits until this
 * transaction ends, and then fails on the foreign key if the parent is gone,
 * instead of writing a holder the delete would cascade away or null out
 * unseen. Plain holders with no guard of their own are protected this way.
 */
export const lockParentRows = async (
  tx: DatabaseClient,
  workspaceId: string,
  rows: readonly { resourceKind: TemplateResourceKind; resourceId: string }[],
): Promise<void> => {
  const byTable = new Map<string, string[]>()
  for (const row of rows) {
    const table = UNINSTALL_PARENT_TABLE[row.resourceKind]
    if (table) {
      byTable.set(table, [...(byTable.get(table) ?? []), row.resourceId])
    }
  }
  for (const table of [...byTable.keys()].sort()) {
    const ids = [...new Set(byTable.get(table))].sort()
    await tx.execute(
      sql`SELECT "id" FROM ${sql.identifier(table)}
          WHERE "workspaceId" = ${workspaceId}::bigint
            AND "id" IN (${sql.join(
              ids.map((id) => sql`${id}::bigint`),
              sql`, `,
            )})
          ORDER BY "id" FOR UPDATE`,
    )
  }
}
