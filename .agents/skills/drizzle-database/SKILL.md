---
name: drizzle-database
description: >-
  Work with Drizzle ORM database schema, migrations, relations, and queries in
  PostgreSQL. Use when creating tables, modifying schema, writing migrations,
  defining relations, or querying the database.
---

# Drizzle Database

Package: `packages/database` (`@chatbotx.io/database`)

## Table Definition

Tables use `pgTable` with `sharedColumns` spread for consistent `id`, `createdAt`, `updatedAt`:

```typescript
import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns, bigintAsString, timestampConfig } from "../partials/shared"
import { otherModel } from "./other"

export const myModel = pgTable(
  "MyModel",
  {
    ...sharedColumns,
    name: text().notNull(),
    description: text(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("MyModel_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("MyModel_name_workspaceId_key").on(
      table.name,
      table.workspaceId,
    ),
  ],
)
```

### Key Conventions

- Table name: `PascalCase` string matching the SQL table name
- Export name: `camelCaseModel` (e.g. `contactModel`, `workspaceModel`)
- `sharedColumns` provides: `id` (bigint as string, auto-generated), `createdAt`, `updatedAt`
- `bigintAsString()` custom type: stores `bigint` in DB, exposes as `string` in app
- FK pattern: `.references(() => otherModel.id, { onDelete, onUpdate })`
- Index naming: `TableName_columnName_idx` or `TableName_column_key` for unique

### Enums

Use `pgEnum` backed by Zod enums from `partials/`:

```typescript
import { pgEnum } from "drizzle-orm/pg-core"
import { myStatusTypes } from "../partials/my-feature"

export const myStatus = pgEnum(
  "myStatus",
  myStatusTypes.options as [string, ...string[]],
)
```

## Relations

Define in `src/relations/<domain>.ts` using `defineRelationsPart`:

```typescript
import { defineRelationsPart } from "drizzle-orm"
import * as schema from "../schema"

export const myModelRelations = defineRelationsPart(schema, (r) => ({
  myModel: {
    workspace: r.one.workspaceModel({
      from: r.myModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    items: r.many.myItemModel({
      from: r.myModel.id,
      to: r.myItemModel.myModelId,
    }),
  },
}))
```

Then add the export to `src/relations/index.ts`.

### Relation Types

- `r.one.targetModel({ from, to })` — belongs-to
- `r.many.targetModel({ from, to })` — has-many
- `r.one.through(r.junctionModel.fk)` — many-to-many via junction

## Migration Workflow

1. **Modify schema** in `src/schema/` (and `src/relations/` if needed)
2. **Generate migration:** `pnpm --filter database make:migration <descriptive_name>`
3. **Apply migration:** `pnpm --filter database db:migrate`
4. **Inspect:** `pnpm --filter database db:studio`

Migrations output to `packages/database/drizzle/<timestamp>_<name>/migration.sql`.

## Schema Registration

After creating a new table:
1. Export from `src/schema/index.ts`: `export * from "./<file>"`
2. Add type alias in `src/types.ts`: `export type MyModel = typeof myModel.$inferSelect`
3. Add relations in `src/relations/<domain>.ts` and re-export in `src/relations/index.ts`

## Query Patterns

### Relational Queries

```typescript
import { db } from "@chatbotx.io/database/client"

const items = await db.query.myModel.findMany({
  where: { workspaceId },
  with: { workspace: true },
  columns: { id: true, name: true },
})

const item = await db.query.myModel.findFirst({
  where: { id: itemId, workspaceId },
})
```

### SQL Builder

```typescript
import { db, eq, and, inArray } from "@chatbotx.io/database/client"
import { myModel } from "@chatbotx.io/database/schema"

await db
  .update(myModel)
  .set({ name: "new name" })
  .where(and(eq(myModel.id, id), eq(myModel.workspaceId, workspaceId)))

await db.insert(myModel).values({ name, workspaceId })
```

### Helpers

```typescript
import { findOrFail } from "@chatbotx.io/database/client"
import { myModel } from "@chatbotx.io/database/schema"

const item = await findOrFail({ table: myModel, where: { id } })
```

## Imports Cheatsheet

| What | Import from |
|------|-------------|
| `db`, `eq`, `and`, `inArray`, etc. | `@chatbotx.io/database/client` |
| Table models | `@chatbotx.io/database/schema` |
| TypeScript types | `@chatbotx.io/database/types` |
| Partials, Zod enums | `@chatbotx.io/database/partials` |
| `sharedColumns`, `bigintAsString` | `../partials/shared` (within package) |
