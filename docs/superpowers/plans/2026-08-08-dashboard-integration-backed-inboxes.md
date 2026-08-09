  # Integration-Backed Inbox Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `inboxService.list` return inboxes that still have a backing channel-integration row (regardless of `Inbox.status`), so Dashboard / conversation inbox / public APIs stop diverging from Settings > Channels.

**Architecture:** Replace the `status = 'connected'` filter in `inboxService.list` with an existence check over the inbox's 8 channel-integration relations, expressed as a Drizzle RQB v2 `where` using the `{ relationName: true }` EXISTS shorthand inside an `OR`. The same `where` object feeds both `db.query.inboxModel.findMany` (data) and the existing `countWithRelationsFilter` helper from `@chatbotx.io/database/client` (page total), so data and `pageCount` stay in sync.

**Amendment (post Task 1):** Task 1's guard test found that the bare 2-arg `relationsFilterToSQL(table, where)` call — which is what the current `list()` uses for its count, and what this plan originally specified for Task 2 — throws `DrizzleError: Unknown relational filter field` for any `where` containing a relation-name key (it only resolves plain columns; the 2-arg overload defaults the relations graph to `{}`). The already-established, already-tested fix for this in the codebase is `countWithRelationsFilter`/`countWithRelationsFilterCapped` (`packages/database/src/client.ts:58-109`, used identically by `apps/builder/src/features/contacts/queries/list-contacts.queries.ts` for `contactModel`), which resolves the real relations graph internally. Task 2 below uses that helper instead of raw `relationsFilterToSQL` + `db.$count`. This also removes a `relationsFilterToSQL` import and an `as never` cast that would otherwise be needed — net simpler than the original plan.

**Tech Stack:** TypeScript, Drizzle ORM `1.0.0-beta.22` (RQB v2), Vitest.

## Background / Root cause

Production có các inbox `status='disconnected'` nhưng row `Integration<Channel>` (IntegrationMessenger…) vẫn tồn tại → **Settings > Channels** (đọc thẳng bảng integration, bỏ qua `Inbox.status`) vẫn hiện channel, còn **Dashboard / màn Inbox / 2 public API** (qua `inboxService.list` lọc `status='connected'`) thì ẩn → hai mặt lệch nhau.

Hai đường tạo ra state lệch (cả hai đều để lại integration row còn sống):
- **Case B (nguyên nhân thực tế của 11 row `tenantId=1` đã quan sát):** token OAuth hỏng vĩnh viễn → SDK gọi `authStore.markOffline` (`packages/business/src/integration-context/auth-store.ts:64-73`) set `Inbox.status='disconnected'`, không xoá integration.
- **Case A (reseller):** `tenantService.suspend()` (`teardownLevel="pause"`) set mọi inbox `disconnected` giữ integration; `reactivate()` không khôi phục status.

Ngược lại, disconnect **chủ động** xoá integration row cùng transaction (vd `apps/builder/src/features/integration-messenger/actions/disconnect-messenger.ts`).

**Quyết định:** `inboxService.list` bỏ lọc `status`, chỉ trả inbox **còn integration row** → tập inbox = đúng tập Settings hiển thị. Áp cho cả 4 nơi dùng `list`. Không sửa gốc A/B, không vá data (`Inbox.status` đã xác nhận không phải cổng chức năng gửi/nhận tin). Card giữ nguyên (hiện y hệt connected). Case A không cần thêm transaction.

Kết quả đúng cho mọi case:

| Trạng thái inbox | Integration row | Hiển thị |
|---|---|---|
| connected | có | ✅ |
| disconnected — case A / B | còn | ✅ |
| disconnected — user chủ động gỡ | đã xoá | ❌ |

## Global Constraints

- No production data is mutated by this change; display-only.
- Do NOT change `InboxService.withIntegrations`, the `list` return shape, or any UI component.
- `{ relationName: true }` inside a relational `where` compiles to `EXISTS(subquery)` — verified in `node_modules/drizzle-orm/relations.js` (`(value ? exists : notExists)(subquery)`). This shorthand has no prior use in this repo, so Task 1 adds a guard test before Task 2 relies on it.
- The 8 channel-integration relations (must all appear in the `OR`): `integrationWhatsapp`, `integrationWebchat`, `integrationMessenger`, `integrationInstagram`, `integrationZalo`, `integrationTelegram`, `integrationSmtp`, `integrationTiktok` (declared in `packages/database/src/relations/inbox.ts`, mirrored by `InboxService.withIntegrations` in `packages/business/src/inbox/service.ts:31-40`).
- Counting rows for a relation-keyed `where` MUST go through `countWithRelationsFilter` (`@chatbotx.io/database/client`), never a bare `relationsFilterToSQL(table, where)` + `db.$count` — the bare 2-arg form cannot resolve relation names (Task 1 finding). `countWithRelationsFilter` is the same helper `contactModel` listing already uses.
- Run commands from the repo root.

---

### Task 1: Guard test — prove `{ relation: true }` renders EXISTS for every integration table

Proves the untested Drizzle shorthand generates the SQL we depend on, before the service relies on it. Mirrors the existing `renderContactWhere` pattern in `packages/database/__tests__/contact-filter.test.ts`.

**Files:**
- Create: `packages/database/__tests__/inbox-list-where.test.ts`
- Reference (read-only): `packages/database/__tests__/contact-filter.test.ts:1-24`, `packages/database/src/relations/inbox.ts`, `packages/database/src/schema/inbox.ts`

**Interfaces:**
- Consumes: `relationsFilterToSQL` from `drizzle-orm`, `PgDialect` from `drizzle-orm/pg-core`, `inboxModel` from `../src/schema`.
- Produces: nothing consumed by later tasks (guard test only). Documents the exact `where` shape Task 2 will build: `{ workspaceId: string, OR: Array<{ [relation]: true }> }`.

- [ ] **Step 1: Write the test**

```ts
// packages/database/__tests__/inbox-list-where.test.ts
import { relationsFilterToSQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
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

const renderInboxWhere = (where: Record<string, unknown>) => {
  const sqlWhere = relationsFilterToSQL(inboxModel, where as never)
  if (!sqlWhere) {
    throw new Error("Expected inbox filter to render SQL")
  }
  return new PgDialect().sqlToQuery(sqlWhere)
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
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @chatbotx.io/database test -- __tests__/inbox-list-where.test.ts`
Expected: PASS. (This is a characterization/guard test — the Drizzle engine already supports the shorthand, so it should pass immediately. If it FAILS on the `exists`/table-name assertions, STOP: the `{ relation: true }` shorthand does not render as assumed and Task 2's approach must be revisited before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add packages/database/__tests__/inbox-list-where.test.ts
git commit -m "test: guard EXISTS rendering for inbox integration-existence filter"
```

---

### Task 2: Switch `inboxService.list` to integration-existence filter

**Files:**
- Modify: `packages/business/src/inbox/service.ts:42-67` (the `list` method)
- Test: `packages/business/src/inbox/__tests__/service.test.ts:263-285` (rewrite the `InboxService.list` describe block)

**Interfaces:**
- Consumes: `countWithRelationsFilter`, `db`, `inboxModel`, `getPaginationWithDefaults`, `InboxService.withIntegrations`. `countWithRelationsFilter` replaces the current `relationsFilterToSQL` + `db.$count` pair as a `service.ts` import from `@chatbotx.io/database/client` (see plan Amendment above — Task 1 found the bare 2-arg `relationsFilterToSQL` call cannot resolve relation-name keys). The `where` shape proven in Task 1.
- Produces: `inboxService.list(input: ListInboxesRequest): Promise<ListInboxesResponse>` — same signature and return shape (`{ data, pageCount }`) as before; only the filter semantics and the count mechanism change.

- [ ] **Step 1: Rewrite the failing unit test**

This test rewrites shared mock scaffolding used by every test in the file (the `db.$count` mock is replaced by a `countWithRelationsFilter` mock), not just the `InboxService.list` describe block. Make these four edits to `packages/business/src/inbox/__tests__/service.test.ts`:

**1a.** Add an import for `inboxModel` right after the existing `import { ChatbotXException } from "../../errors"` line (line 2):

```ts
import { inboxModel } from "@chatbotx.io/database/schema"
```

**1b.** In the `vi.hoisted` mocks object (lines 4-13), replace `count: vi.fn(),` with `countWithRelationsFilter: vi.fn(),`:

```ts
const mocks = vi.hoisted(() => ({
  inboxFindMany: vi.fn(),
  inboxFindFirst: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  inboxInsert: vi.fn(),
  inboxInsertValues: vi.fn(),
  countWithRelationsFilter: vi.fn(),
}))
```

**1c.** Replace the `vi.mock("@chatbotx.io/database/client", ...)` factory (lines 15-29) — drop `$count` from the `db` object and drop the top-level `relationsFilterToSQL` export, add a top-level `countWithRelationsFilter` export:

```ts
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxModel: {
        findMany: mocks.inboxFindMany,
        findFirst: mocks.inboxFindFirst,
      },
    },
    update: mocks.inboxUpdate,
    insert: mocks.inboxInsert,
  },
  eq: vi.fn((column, value) => ({ column, value })),
  countWithRelationsFilter: mocks.countWithRelationsFilter,
}))
```

**1d.** In `beforeEach` (lines 72-104), replace the `mocks.count.mockReset()` line with `mocks.countWithRelationsFilter.mockReset()` (same position, no other changes to `beforeEach`).

**1e.** Replace the entire `describe("InboxService.list", ...)` block (originally lines 263-285) with:

```ts
describe("InboxService.list", () => {
  const integrationExistsOr = [
    { integrationWhatsapp: true },
    { integrationWebchat: true },
    { integrationMessenger: true },
    { integrationInstagram: true },
    { integrationZalo: true },
    { integrationTelegram: true },
    { integrationSmtp: true },
    { integrationTiktok: true },
  ]

  test("filters by integration existence, not by status", async () => {
    mocks.inboxFindMany.mockResolvedValue([{ id: "integration-backed-inbox" }])
    mocks.countWithRelationsFilter.mockResolvedValue(1)

    const result = await inboxService.list({ workspaceId: "workspace-1" })

    expect(result).toEqual({
      data: [{ id: "integration-backed-inbox" }],
      pageCount: 1,
    })
    const expectedWhere = {
      workspaceId: "workspace-1",
      OR: integrationExistsOr,
    }
    expect(mocks.inboxFindMany).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      where: expectedWhere,
      with: undefined,
    })
    expect(mocks.countWithRelationsFilter).toHaveBeenCalledWith({
      table: inboxModel,
      tsName: "inboxModel",
      where: expectedWhere,
    })
  })

  test("loads integrations when includes=integration is requested", async () => {
    mocks.inboxFindMany.mockResolvedValue([])
    mocks.countWithRelationsFilter.mockResolvedValue(0)

    await inboxService.list({
      workspaceId: "workspace-1",
      includes: ["integration"],
    })

    const call = mocks.inboxFindMany.mock.calls[0][0]
    expect(call.with).toBeDefined()
    expect(call.where).toEqual({
      workspaceId: "workspace-1",
      OR: integrationExistsOr,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @chatbotx.io/business test -- src/inbox/__tests__/service.test.ts`
Expected: FAIL — the current `list` passes `where: { workspaceId, status: "connected" }` and calls `db.$count` (now unmocked, since the mock factory no longer defines it), so both the `where`-shape assertion and the `countWithRelationsFilter` assertion fail.

- [ ] **Step 3: Implement the new filter in `list`**

**3a.** In `service.ts`'s top import block, replace:

```ts
import {
  and,
  type DatabaseClient,
  db,
  eq,
  ne,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
```

with:

```ts
import {
  and,
  countWithRelationsFilter,
  type DatabaseClient,
  db,
  eq,
  ne,
} from "@chatbotx.io/database/client"
```

**3b.** Replace the body of `async list(...)` (`service.ts:42-67`) with:

```ts
  async list(input: ListInboxesRequest): Promise<ListInboxesResponse> {
    // Match Settings > Channels, which lists Integration<Channel> rows directly:
    // return every inbox that still has a backing integration row, regardless of
    // Inbox.status. A `disconnected` inbox whose integration was deleted (a user
    // "Disconnect") stays hidden; one left behind by token markOffline or tenant
    // pause (integration intact) shows. The `{ relation: true }` shorthand renders
    // EXISTS per relation — keep in sync with InboxService.withIntegrations. Counting
    // goes through countWithRelationsFilter (not a bare relationsFilterToSQL + $count)
    // because relation-keyed filters need the real relations graph — see client.ts.
    const where = {
      workspaceId: input.workspaceId,
      OR: [
        { integrationWhatsapp: true },
        { integrationWebchat: true },
        { integrationMessenger: true },
        { integrationInstagram: true },
        { integrationZalo: true },
        { integrationTelegram: true },
        { integrationSmtp: true },
        { integrationTiktok: true },
      ],
    }

    const pagination = getPaginationWithDefaults(input)
    const [data, totalRows] = await Promise.all([
      db.query.inboxModel.findMany({
        ...pagination,
        where,
        with: input.includes?.includes("integration")
          ? InboxService.withIntegrations
          : undefined,
      }),
      countWithRelationsFilter({ table: inboxModel, tsName: "inboxModel", where }),
    ])

    const limit = input.perPage ?? 10
    const pageCount = Math.ceil(totalRows / limit)

    return { data, pageCount }
  }
```

`inboxModel` is already imported in `service.ts` (used elsewhere in the file, e.g. `disconnect`/`isConnected`) — no new import needed for it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @chatbotx.io/business test -- src/inbox/__tests__/service.test.ts`
Expected: PASS (the two new `list` tests plus all existing `disconnect`/`create` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/business/src/inbox/service.ts packages/business/src/inbox/__tests__/service.test.ts
git commit -m "fix(inbox): list inboxes by integration existence instead of status"
```

---

### Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck both touched packages**

Run: `pnpm --filter @chatbotx.io/business check-types && pnpm --filter @chatbotx.io/database check-types`
Expected: no errors. (If `relationsFilterToSQL(inboxModel, where)` reports a type mismatch on `where`, cast only that argument: `relationsFilterToSQL(inboxModel, where as never)` — mirroring `contact-filter.test.ts`. Do not weaken the `findMany` `where` typing.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors on the changed files. (Use `pnpm fix` if Biome reports auto-fixable issues.)

- [ ] **Step 3: Run both affected test files once more together**

Run: `pnpm --filter @chatbotx.io/database test -- __tests__/inbox-list-where.test.ts && pnpm --filter @chatbotx.io/business test -- src/inbox/__tests__/service.test.ts`
Expected: all PASS.

- [ ] **Step 4: Manual sanity check against dev DB (optional but recommended)**

Confirm the generated SQL actually returns integration-backed disconnected inboxes. In `pnpm --filter @chatbotx.io/database db:studio` (or psql), verify a known `Inbox` row with `status='disconnected'` + a live `IntegrationMessenger` row now appears in the Dashboard for its workspace, and a `disconnected` inbox with no integration row does not.

## Self-Review

- **Spec coverage:** Filter rule (integration existence, no status) → Task 2. `{relation:true}`→EXISTS de-risk → Task 1. Same `where` for findMany + count → Task 2 Step 3. Tests for included/excluded cases → Task 1 (SQL) + Task 2 (behavior via mocks). No UI change → not touched. No data mutation → not touched. Case A needs no transaction → documented in spec, no task needed.
- **Placeholder scan:** none — all steps carry real code/commands.
- **Type consistency:** the 8 relation keys are identical across Task 1's `INTEGRATION_RELATIONS`, Task 2's test `integrationExistsOr`, and Task 2's `list` `OR` array; return shape `{ data, pageCount }` unchanged.
