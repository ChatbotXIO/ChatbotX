### Phase 2: Database (create schema + register in 7 files)

Create 2 new files, edit 5 existing files. Do all edits in a single batch.

**Create `packages/database/src/schema/integration-<channel>.ts`:**

```typescript
import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integration<Channel>Model = pgTable(
  "Integration<Channel>",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString().notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
    inboxId: bigintAsString().notNull()
      .references(() => inboxModel.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    index("Integration<Channel>_workspaceId_idx").using("btree", table.workspaceId.asc().nullsLast()),
    uniqueIndex("Integration<Channel>_inboxId_key").using("btree", table.inboxId.asc().nullsLast()),
  ],
)
```

**Create `packages/database/src/relations/integration-<channel>.ts`:**

```typescript
import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integration<Channel>Relations = defineRelationsPart(schema, (r) => ({
  integration<Channel>Model: {
    workspace: r.one.workspaceModel({
      from: r.integration<Channel>Model.workspaceId, to: r.workspaceModel.id, optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integration<Channel>Model.inboxId, to: r.inboxModel.id, optional: false,
    }),
  },
}))
```

**Edit 5 registration files (all in one batch):**

| #   | File                                            | Edit                                                                                               |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `packages/utils/src/channel.ts`                 | Add `"<channel>"` to the `channelTypes` z.enum. **Defined here**, not in `database/partials/channel.ts` (that file only re-exports it, so `flow-config` can depend on it without the database layer) |
| 2   | `packages/database/src/partials/integration.ts` | Add `"<channel>"` to `integrationTypes` z.enum array                                               |
| 3   | `packages/database/src/schema/index.ts`         | Add `export * from "./integration-<channel>"`                                                      |
| 4   | `packages/database/src/relations/index.ts`      | Add import at top AND spread in `relations` object                                                 |
| 5   | `packages/database/src/types.ts`                | Add `export type Integration<Channel>Model = typeof schema.integration<Channel>Model.$inferSelect` |

**CRITICAL — `relations/index.ts` needs TWO edits:**

1. Import: `import { integration<Channel>Relations } from "./integration-<channel>"`
2. Spread: `...integration<Channel>Relations,` in the relations object

After editing, immediately read back each file to verify both import AND spread are present.
