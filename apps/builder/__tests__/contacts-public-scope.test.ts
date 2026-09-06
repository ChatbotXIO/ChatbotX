// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// Same rationale as public-spec-operations.test.ts: importing the real
// contacts public router transitively pulls in `@chatbotx.io/database/client`
// (opens a real `pg.Pool`) and `@/orpc`'s `authorizedAPI` chain (boots the
// full better-auth stack via `@/middlewares/auth`). Neither is reachable from
// this test — it only inspects which scope each submodule registered its
// procedures under — so both are stubbed to keep the import side-effect-free.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

const workspaceTokenAuthAPIForScope = vi.hoisted(() =>
  vi.fn((_scope: string) => {
    const chain = {
      route: vi.fn(() => chain),
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn(() => ({})),
    }
    return chain
  }),
)

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

// Each submodule calls `workspaceTokenAuthAPIForScope` exactly once (or twice,
// for messages.ts) at import time — `packages/utils`' Snowflake ID generator
// is a process-wide singleton that throws on re-init, so every submodule is
// imported exactly once here (no `vi.resetModules()` between them) and the
// full accumulated call list is asserted at the end, per submodule slice.
await import("@/features/contacts/api/public/crud")
const crudCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/tags")
await import("@/features/contacts/api/public/custom-fields")
const tagsAndFieldsCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contact-notes/api/public")
const notesCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contact-sequences/api/public")
const sequencesCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contact-inboxes/api/public")
const inboxesCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/export")
const exportFilesCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contact-filter/api/public")
const filterFieldsCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/bulk")
const bulkCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/export")
const exportCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/refresh-profile")
const refreshProfileCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/contacts/api/public/messages")
const messagesCallCount = workspaceTokenAuthAPIForScope.mock.calls.length

await import("@/features/folders/api/public")

const allScopeCalls = workspaceTokenAuthAPIForScope.mock.calls.map(
  (call) => call[0],
)

describe("contacts public router scope wiring", () => {
  test("crud.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(0, crudCallCount)).toEqual(["contacts"])
  })

  test("tags-and-fields.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(crudCallCount, tagsAndFieldsCallCount)).toEqual([
      "contacts",
      "contacts",
    ])
  })

  test("notes.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(tagsAndFieldsCallCount, notesCallCount)).toEqual(
      ["contacts"],
    )
  })

  test("sequences.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(notesCallCount, sequencesCallCount)).toEqual([
      "contacts",
    ])
  })

  test("inboxes.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(sequencesCallCount, inboxesCallCount)).toEqual([
      "contacts",
    ])
  })

  test("export-files.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(inboxesCallCount, exportFilesCallCount)).toEqual(
      ["contacts"],
    )
  })

  test("filter-fields.ts registers under the 'contacts' scope", () => {
    expect(
      allScopeCalls.slice(exportFilesCallCount, filterFieldsCallCount),
    ).toEqual(["contacts"])
  })

  test("bulk.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(filterFieldsCallCount, bulkCallCount)).toEqual([
      "contacts",
    ])
  })

  test("export.ts registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(bulkCallCount, exportCallCount)).toEqual([])
  })

  test("refresh-profile.ts registers under the 'contacts' scope", () => {
    expect(
      allScopeCalls.slice(exportCallCount, refreshProfileCallCount),
    ).toEqual(["contacts"])
  })

  test("messages.ts registers under both the inbox and automation scopes, never contacts", () => {
    const messagesScopes = allScopeCalls.slice(
      refreshProfileCallCount,
      messagesCallCount,
    )
    expect(messagesScopes).toEqual(
      expect.arrayContaining(["inbox", "automation"]),
    )
    expect(messagesScopes).not.toContain("contacts")
  })

  test("folders public router registers under the 'contacts' scope", () => {
    expect(allScopeCalls.slice(messagesCallCount)).toEqual(["contacts"])
  })
})
