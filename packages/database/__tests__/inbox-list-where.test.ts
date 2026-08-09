import { relationsFilterToSQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { relations } from "../src/relations"
import { inboxModel } from "../src/schema"

const INTEGRATION_RELATIONS = [
  "integrationWhatsapp",
  "integrationWebchat",
  "integrationMessenger",
  "integrationInstagram",
  "integrationZalo",
  "integrationTelegram",
  "integrationSmtp",
  "integrationTiktok",
] as const

const dialect = new PgDialect()

// `relationsFilterToSQL(table, filter)` (the two-argument overload) defaults
// `tableRelations`/`tablesRelations` to `{}`, so it can only ever resolve
// column filters — it throws "Unknown relational filter field" on any
// `{ relation: true }` shorthand. The real runtime relation graph (built by
// `db`'s `drizzle({ schema, relations })` config in `../src/client.ts`) must
// be supplied via the four/five-argument overload, mirroring
// `resolveRelationsFilter` in that file.
const renderInboxWhere = (where: Record<string, unknown>) => {
  const sqlWhere = relationsFilterToSQL(
    inboxModel,
    where as never,
    relations.inboxModel.relations,
    relations,
    dialect.casing,
  )
  if (!sqlWhere) {
    throw new Error("Expected inbox filter to render SQL")
  }
  return dialect.sqlToQuery(sqlWhere)
}

// The integration-existence filter Task 2 builds in inboxService.list.
const buildIntegrationExistsWhere = (workspaceId: string) => ({
  workspaceId,
  OR: INTEGRATION_RELATIONS.map((relation) => ({ [relation]: true })),
})

describe("inbox integration-existence where", () => {
  test("renders an EXISTS subquery for every integration table", () => {
    const { sql } = renderInboxWhere(buildIntegrationExistsWhere("ws-1"))

    expect(sql).toContain("exists")
    expect(sql).toContain('"IntegrationWhatsapp"')
    expect(sql).toContain('"IntegrationWebchat"')
    expect(sql).toContain('"IntegrationMessenger"')
    expect(sql).toContain('"IntegrationInstagram"')
    expect(sql).toContain('"IntegrationZalo"')
    expect(sql).toContain('"IntegrationTelegram"')
    expect(sql).toContain('"IntegrationSmtp"')
    expect(sql).toContain('"IntegrationTiktok"')
    // Still scoped to the workspace.
    expect(sql).toContain('"workspaceId"')
  })
})
