import { beforeEach, expect, test, vi } from "vitest"
// Deep relative import on purpose: `@chatbotx.io/database` publishes no
// `./relations` subpath (the relation parts are internal to `client.ts`), and
// this test's whole point is to compare against the *actual* definition rather
// than a copy of it. `packages/business/tsconfig.json` only type-checks
// `src/**`, so reaching across the package boundary here does not leak into the
// published build.
import { inboxRelations } from "../../database/src/relations/inbox"

/**
 * `InboxService.withIntegrations` is passed straight to Drizzle's `with:`
 * clause. A key listed there but missing from `inboxRelations.inboxModel`
 * compiles fine — `InboxWithIntegrations` is a hand-written type, so TypeScript
 * has no idea the relation is undefined — and then blows up at runtime with
 * `TypeError: Cannot read properties of undefined (reading 'targetTable')`,
 * taking down every page that loads an inbox with its integrations.
 *
 * Both sides are read from their real definitions (no hardcoded channel list),
 * so adding a channel to one without the other fails here.
 */

const findManyMock = vi.fn()
const findFirstMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  db: {
    $count: vi.fn().mockResolvedValue(0),
    query: {
      inboxModel: {
        findFirst: findFirstMock,
        findMany: findManyMock,
      },
    },
  },
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: [column, value] })),
  relationsFilterToSQL: vi.fn(() => ({})),
}))

vi.mock("../src/base.service", () => ({
  BaseService: class {},
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: { consume: vi.fn(), release: vi.fn() },
}))

vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { decrement: vi.fn(), increment: vi.fn() },
}))

/**
 * `defineRelationsPart(schema, ...)` returns
 * `{ [tableKey]: { table, name, relations } }`, so the relation names a table
 * actually defines live under `.relations`. Nothing in drizzle's public types
 * exposes that map, hence the cast.
 */
type RelationsPart = Record<string, { relations: Record<string, unknown> }>

const definedInboxRelations = new Set(
  Object.keys(
    (inboxRelations as unknown as RelationsPart).inboxModel.relations,
  ),
)

const captureWithClause = async (
  call: (service: {
    findWithIntegrationsById: (props: { id: string }) => Promise<unknown>
    listWithIntegrationsByWorkspace: (workspaceId: string) => Promise<unknown>
  }) => Promise<unknown>,
  mock: typeof findManyMock,
): Promise<Record<string, unknown>> => {
  const { inboxService } = await import("../src/inbox/service")
  await call(inboxService)

  const [args] = mock.mock.calls.at(-1) as [{ with?: Record<string, unknown> }]
  const withClause = args.with
  expect(withClause).toBeDefined()
  return withClause as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  findManyMock.mockResolvedValue([])
  findFirstMock.mockResolvedValue(undefined)
})

test("every relation listWithIntegrationsByWorkspace eager-loads is defined on inboxModel", async () => {
  const withClause = await captureWithClause(
    (service) => service.listWithIntegrationsByWorkspace("workspace-1"),
    findManyMock,
  )

  const undefinedRelations = Object.keys(withClause).filter(
    (relation) => !definedInboxRelations.has(relation),
  )

  expect(
    undefinedRelations,
    `InboxService.withIntegrations references relations that packages/database/src/relations/inbox.ts does not define: ${undefinedRelations.join(", ")}. Drizzle throws "Cannot read properties of undefined (reading 'targetTable')" at runtime for these.`,
  ).toEqual([])
})

test("every relation findWithIntegrationsById eager-loads is defined on inboxModel", async () => {
  const withClause = await captureWithClause(
    (service) => service.findWithIntegrationsById({ id: "inbox-1" }),
    findFirstMock,
  )

  const undefinedRelations = Object.keys(withClause).filter(
    (relation) => !definedInboxRelations.has(relation),
  )

  expect(undefinedRelations).toEqual([])
})

test("withIntegrations covers every integration relation inboxModel defines", async () => {
  // Reverse direction: without this, dropping a channel from
  // `withIntegrations` would silently shrink the matrices that
  // `workspace-lifecycle.channel-switch-exhaustive.test.ts` derives from it,
  // and both suites would go green while the channel stopped being loaded.
  const withClause = await captureWithClause(
    (service) => service.listWithIntegrationsByWorkspace("workspace-1"),
    findManyMock,
  )

  const definedIntegrationRelations = [...definedInboxRelations]
    .filter((relation) => relation.startsWith("integration"))
    .sort()

  expect(definedIntegrationRelations).toEqual(
    Object.keys(withClause)
      .filter((relation) => relation.startsWith("integration"))
      .sort(),
  )
})
