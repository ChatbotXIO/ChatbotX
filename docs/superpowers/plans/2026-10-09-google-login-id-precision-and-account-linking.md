# Google Login: Id Precision and Account Linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop better-auth from rounding 64-bit ids through JavaScript `Number`; let a trusted social sign-in claim an existing *unverified* local account safely (invalidating any password and sessions that placeholder carried); and show the OAuth error on the sign-in page instead of a silent bounce.

**Architecture:** Two option changes plus one database hook on the single `betterAuth(...)` config in `packages/auth/src/server.ts` (shared by the platform instance and every per-tenant instance from `apps/builder/src/lib/auth/auth-instances.ts`), and a small client banner in `apps/builder/src/features/auth/sign-in.tsx`. No schema, migration, or automatic data change. Ids keep flowing as the strings `bigintAsString` already models; better-auth simply stops coercing them.

**Tech Stack:** better-auth 1.6.22 (`@better-auth/core` adapter factory; `@better-auth/memory-adapter` for DB-free tests), drizzle `bigintAsString`, vitest, Next.js 16 + next-intl.

**Spec:** The 2026-10-09 investigation in this conversation. Root causes with evidence:

1. **Id precision.** `packages/auth/src/server.ts:731` sets `advanced.database.generateId: "serial"`. With that value `@better-auth/core/dist/db/adapter/factory.mjs:125-126` (writes) and `:237-239` (where-clauses) wrap every `id` and every field that `references` an `id` (`Account.userId`, `Session.userId`) in `Number()`. Repo ids are snowflakes (`packages/utils/src/id.ts`) above `2^53` since 2021-07-03, so every **odd** id is rounded to its even neighbour. Reproduced through the real drizzle adapter and the memory adapter. Production: 93 of 1078 users have odd ids; they cannot create a session or link an account; where the even neighbour exists, their social account/session is attached to **another user**.
2. **Account linking.** `server.ts:514-528` enables `accountLinking` with Google/Facebook as `trustedProviders` and leaves `requireLocalEmailVerified` at its default `true`. `better-auth/dist/oauth2/link-account.mjs:22-26` therefore refuses to link a social sign-in to a local user whose `emailVerified` is `false` (email/password sign-up that never verified; Facebook-first users, because Facebook never returns `email_verified`). Production log `ERROR [Better Auth]: account_not_linked`; the user has `emailVerified=false` and no `Account` rows. Simply flipping the flag is unsafe: an attacker who pre-registered the victim's email with a password (unverified) would get a working password once the victim's verified Google sign-in links and marks the user verified (`link-account.mjs:49`). The fix must invalidate the placeholder's credentials and sessions at link time.
3. **Silent bounce.** Every OAuth callback error redirects to `/api/auth/error?error=<code>`; in production that route answers `302 /?error=<code>` (`better-auth/dist/api/routes/error.mjs:376-379`); `/` needs a session, so `apps/builder/src/proxy.ts:48` redirects to `/auth/sign-in?callbackURL=https://<host>/?error=<code>`. `features/auth/sign-in.tsx` never reads `error`.

## Global Constraints

- Node >= 24, pnpm 10.x. Before calling any task done: `pnpm lint`, `pnpm --filter @chatbotx.io/auth exec tsc --noEmit` (the auth package has **no** `check-types` script; its `tsconfig.json` covers `src/**/*` only — tests are type-checked by vitest/esbuild, not tsc), `pnpm --filter builder check-types`.
- No `any`; structured logger key is `err` (`packages/auth/src/logger.ts` exports `logger = getChildLogger("Auth")`); never import `db` in app code (AGENTS.md invariants 9, 20).
- All user-facing strings go through `useTranslations()`; a runtime-selected key must come from an **exhaustive literal map**, not a template string; **every key must exist in all 21 files under `apps/builder/messages/`** (`en.json` + 20 locales) — `i18n:check --source en --locales messages` runs in the builder `lint` script (`.agents/skills/builder-ui-i18n/SKILL.md`).
- Commit format `<type>(<scope>): <subject>` (lowercase after colon, ≤ 100 chars); stage files explicitly; never `git add -A`; never `--no-verify` (`.agents/rules/git.md`).
- Branch: `fix/google-login-id-precision` off `origin/main`.
- Do not change ids in the database. Do not auto-repair misattached rows (see Task 4 remediation).
- Keep `requireEmailVerification: true` for email/password sign-up (`server.ts:542`) and leave `allowDifferentEmails` unset.

## Review Focus

1. **Per-tenant auth instances** must get all three auth changes — covered because they live inside `createAuth`; Task 1 step 2 and Task 2 step 1 assert on the config captured from a real `createAuth({})` call.
2. **Models whose ids better-auth now generates itself** (`user`, `account`, `session`, `verification`): with a function `generateId`, better-auth calls it on every `create` instead of letting the DB default `$defaultFn(createId)` run. Same generator, same bigint-shaped string. Task 1 step 1 asserts generated ids for all four models are numeric strings within signed-bigint range and unique.
3. **Explicit ids** (`forceAllowId`) and the tenant-scoped `create` wrapper: Task 1 step 1 creates a user with an explicit odd id through `createTenantScopedAdapter(memoryAdapter(...))` and asserts the id is stored verbatim with `tenantId` stamped.
4. **Trusted providers bypass provider-side verification** (`link-account.mjs:23`): with `requireLocalEmailVerified: false`, a Facebook sign-in (no `email_verified`) links to an unverified local user too; better-auth then leaves the user unverified. The cleanup hook (Task 2) runs for any non-credential provider, so the placeholder's password and sessions are gone either way, and password sign-in stays blocked by `requireEmailVerification`. Task 2 step 1 covers verified-Google, Facebook-without-flag, already-verified user (no-op), and credential-provider (no-op).
5. **Error banner must not become an injection sink**: the code is matched with `Object.hasOwn` against a fixed map (prototype names like `constructor` fall to `generic`), the translation key comes from an exhaustive literal map, nothing from the query is echoed, and a `callbackURL` on a foreign origin is ignored. Task 3 step 1 pins all of these.

---

### Task 1: Stop better-auth from coercing ids to `Number`

**Files:**
- Modify: `packages/auth/src/server.ts:729-733` (the `advanced.database` block) and the export block near `SOCIAL_PROVIDERS` (~line 245)
- Test (new): `packages/auth/__tests__/id-precision.test.ts`
- Reference for mocks: `packages/auth/__tests__/bearer-plugin.test.ts:1-70` (its `@chatbotx.io/utils` mock already provides `createId`)

**Interfaces:**
- Consumes: `createId(): string` from `@chatbotx.io/utils` (already imported in `server.ts:23`); `createTenantScopedAdapter(base: AdapterFactory): AdapterFactory` from `server.ts:102`; `memoryAdapter` from `better-auth/adapters/memory`.
- Produces: `export const AUTH_DATABASE_OPTIONS = { generateId: () => createId() }` and `createAuth` wiring it as `advanced.database`.

- [ ] **Step 1: Write the failing behavioural tests (memory adapter, no DB)**

Create `packages/auth/__tests__/id-precision.test.ts`. Copy the `vi.hoisted` + `vi.mock` scaffolding from `bearer-plugin.test.ts:1-70` verbatim (it stubs `betterAuth` to return its config, stubs the drizzle adapter, next-js, plugins, database client/schema, business, mail, and mocks `@chatbotx.io/utils` with `createId: () => "test-id"`), then **override** the utils mock so `createId` is real:

```ts
vi.mock("@chatbotx.io/utils", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/utils")>("@chatbotx.io/utils")
  return { ...actual, getPublicOriginFromRequest: vi.fn() }
})
```

Then the tests:

```ts
import { memoryAdapter } from "better-auth/adapters/memory"
import type { BetterAuthOptions } from "better-auth"
import { describe, expect, test } from "vitest"

const ODD_ID = "11728999944477963" // > 2^53 and odd: not representable as a double
const EVEN_NEIGHBOUR = "11728999944477964"
const PG_BIGINT_MAX = 9223372036854775807n
const now = () => new Date()

/** The `advanced.database` block the real config hands to better-auth. */
const databaseOptionsFromCreateAuth = async () => {
  const { createAuth } = await import("../src/server")
  createAuth({})
  const config = betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthOptions
  return config.advanced?.database as { generateId: (o: { model: string }) => string }
}

/** Memory adapter driven by that block; `seed` prepopulates the backing store. */
const adapterWith = async (seed: { user?: Record<string, unknown>[] } = {}) => {
  const database = await databaseOptionsFromCreateAuth()
  const store = { user: seed.user ?? [], account: [], session: [], verification: [] }
  return { adapter: memoryAdapter(store)({ advanced: { database } } as never), store }
}

const oddUser = { id: ODD_ID, email: "odd@example.test", name: "odd", emailVerified: true, createdAt: now(), updatedAt: now() }
const evenUser = { ...oddUser, id: EVEN_NEIGHBOUR, email: "even@example.test", name: "even" }

describe("64-bit ids through better-auth's adapter factory", () => {
  test("a where-clause on an odd id finds that user, not the even neighbour", async () => {
    const { adapter } = await adapterWith({ user: [oddUser, evenUser] })
    const found = await adapter.findOne<{ id: string }>({ model: "user", where: [{ field: "id", value: ODD_ID }] })
    expect(found?.id).toBe(ODD_ID)
  })

  test("Account.userId and Session.userId are stored exactly", async () => {
    const { adapter } = await adapterWith({ user: [oddUser] })
    const account = await adapter.create<{ userId: string }>({
      model: "account",
      data: { userId: ODD_ID, providerId: "google", accountId: "sub", createdAt: now(), updatedAt: now() },
    })
    const session = await adapter.create<{ userId: string }>({
      model: "session",
      data: { userId: ODD_ID, token: "tok", expiresAt: now(), createdAt: now(), updatedAt: now() },
    })
    expect(account.userId).toBe(ODD_ID)
    expect(session.userId).toBe(ODD_ID)
  })

  test("update and delete predicates on an odd user id hit the right row", async () => {
    const { adapter, store } = await adapterWith({ user: [oddUser, evenUser] })
    await adapter.update({ model: "user", where: [{ field: "id", value: ODD_ID }], update: { name: "renamed" } })
    expect(store.user.find((u) => u.id === ODD_ID)?.name).toBe("renamed")
    expect(store.user.find((u) => u.id === EVEN_NEIGHBOUR)?.name).toBe("even")
    await adapter.delete({ model: "user", where: [{ field: "id", value: ODD_ID }] })
    expect(store.user.map((u) => u.id)).toEqual([EVEN_NEIGHBOUR])
  })

  test.each(["user", "account", "session", "verification"] as const)(
    "generated %s ids are unique numeric strings inside signed bigint range",
    async (model) => {
      const { adapter } = await adapterWith({ user: [oddUser] })
      const base: Record<string, Record<string, unknown>> = {
        user: { email: "g@example.test", name: "g", emailVerified: false },
        account: { userId: ODD_ID, providerId: "google", accountId: "s" },
        session: { userId: ODD_ID, token: "t", expiresAt: now() },
        verification: { identifier: "i", value: "v", expiresAt: now() },
      }
      const ids = new Set<string>()
      for (let i = 0; i < 5; i++) {
        const row = await adapter.create<{ id: string }>({
          model,
          data: { ...base[model], createdAt: now(), updatedAt: now(), ...(model === "user" ? { email: `g${i}@example.test` } : {}) },
        })
        expect(row.id).toMatch(/^\d{10,19}$/)
        expect(BigInt(row.id) <= PG_BIGINT_MAX).toBe(true)
        ids.add(row.id)
      }
      expect(ids.size).toBe(5)
    },
  )

  test("the tenant-scoped wrapper keeps an explicit odd id and stamps tenantId", async () => {
    const { createTenantScopedAdapter } = await import("../src/server")
    const database = await databaseOptionsFromCreateAuth()
    const store = { user: [], account: [], session: [], verification: [] }
    const adapter = createTenantScopedAdapter(memoryAdapter(store))({ advanced: { database } } as never)
    const user = await adapter.create<{ id: string; tenantId: string }>({
      model: "user",
      data: { ...oddUser },
      forceAllowId: true,
    })
    expect(user.id).toBe(ODD_ID)
    expect(user.tenantId).toBe("1")
  })
})
```

Note: `createTenantScopedAdapter` uses `getTenantId()` which falls back to `ROOT_TENANT_ID` (`"1"`) when nothing is bound. If `ROOT_TENANT_ID` is not the literal `"1"` in this checkout, import it from the same place `server.ts` does and compare against it.

- [ ] **Step 2: Write the failing config test**

Append to the same file:

```ts
describe("createAuth database options", () => {
  test("hands better-auth a function generateId that returns a snowflake string, never 'serial'", async () => {
    const database = await databaseOptionsFromCreateAuth()
    expect(typeof database.generateId).toBe("function")
    const id = database.generateId({ model: "user" })
    expect(id).toMatch(/^\d{10,19}$/)
    expect(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  test("a tenant-flavoured createAuth call shares the same database options", async () => {
    const { createAuth, AUTH_DATABASE_OPTIONS } = await import("../src/server")
    createAuth({ onUserCreated: async () => undefined })
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthOptions
    expect(config.advanced?.database).toBe(AUTH_DATABASE_OPTIONS)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @chatbotx.io/auth exec vitest run __tests__/id-precision.test.ts`
Expected: FAIL — `findOne` returns the even neighbour, `account.userId` is `"11728999944477964"`, `generateId` is `"serial"`, `AUTH_DATABASE_OPTIONS` is undefined.

- [ ] **Step 4: Implement**

In `packages/auth/src/server.ts`, next to `SOCIAL_PROVIDERS` (after the adapter factory, ~line 245):

```ts
/**
 * Repo ids are 64-bit snowflakes (`createId`) that passed 2^53 in 2021. Never
 * use `generateId: "serial"` here: that flag makes better-auth's adapter
 * factory wrap every id and id reference (`Account.userId`, `Session.userId`)
 * in `Number()`, which rounds every odd id to its even neighbour — sessions and
 * linked accounts then land on the wrong user, or fail the FK when the
 * neighbour does not exist. A function generator keeps ids as the strings
 * `bigintAsString` already models.
 */
export const AUTH_DATABASE_OPTIONS = {
  generateId: () => createId(),
} as const
```

Replace lines 729-733 with:

```ts
    advanced: {
      database: AUTH_DATABASE_OPTIONS,
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @chatbotx.io/auth exec vitest run __tests__/id-precision.test.ts`
Expected: 7 passed.

- [ ] **Step 6: Run the auth suite, typecheck, lint**

Run: `pnpm --filter @chatbotx.io/auth test && pnpm --filter @chatbotx.io/auth exec tsc --noEmit && pnpm --filter builder check-types && npx ultracite check packages/auth/src/server.ts packages/auth/__tests__/id-precision.test.ts`
Expected: green. If a sibling test's utils mock breaks because the module now reads `createId` at import time, add `createId: () => "test-id"` to that mock (bearer-plugin, social-redirect-origin, trusted-origins-build-phase already have it).

- [ ] **Step 7: Commit**

```bash
git add packages/auth/src/server.ts packages/auth/__tests__/id-precision.test.ts
git commit -m "fix(auth): keep 64-bit ids exact instead of rounding them through Number"
```

---

### Task 2: Let a trusted social sign-in claim an unverified local account — safely

**Files:**
- Create: `packages/auth/src/claim-unverified-account.ts` (the hook, pure over `internalAdapter`)
- Modify: `packages/auth/src/server.ts:396-458` (`buildDatabaseHooks`) and `:514-528` (`accountLinking`)
- Test (new): `packages/auth/__tests__/claim-unverified-account.test.ts`
- Test (new): `packages/auth/__tests__/account-linking.test.ts`

**Interfaces:**
- Produces: `claimUnverifiedAccountAfterLink(account, context): Promise<void>` typed as better-auth's `databaseHooks.account.create.after`:
  ```ts
  import type { BetterAuthOptions } from "better-auth"
  type AccountCreateAfterHook = NonNullable<NonNullable<NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["account"]>["create"]>["after"]>
  ```
- Consumes (better-auth `internalAdapter`, all id-keyed and tenant-neutral): `findUserById(userId)`, `findAccounts(userId)`, `deleteAccount(id)`, `listSessions(userId)`, `deleteSessions(tokens)`.

**Why a hook:** `link-account.mjs:36-47` inserts the social `Account` through `createWithHooks` **before** it marks the user verified (line 49/65), so inside `account.create.after` the user row still shows `emailVerified: false` — exactly the "placeholder" signal. Only an **email-attesting** provider (config set `EMAIL_ATTESTING_PROVIDERS`, currently `google`) may claim such a placeholder; any other provider (Facebook never returns `email_verified`) makes the hook throw, so the link is refused exactly as before this change. On a claim, every other `Account` row of the placeholder (password, Facebook, anything) and all its sessions are removed before the link completes — the attesting sign-in is the first proof of mailbox ownership, so every earlier login method on that placeholder is untrusted. The hook **fails closed** (throws → `unable_to_link_account`).

**Amendment 2 (controller ruling, 2026-10-09 — supersedes the hook design below):** better-auth 1.6.22 DEFERS `account.create.after` hooks until after the HTTP handler returns (`db/with-hooks.mjs:30-38` → `@better-auth/core/dist/context/transaction.mjs:86-90`, flushed by `auth/base.mjs:33`), so an after-hook sees the user already marked verified and a throw there lands after the insert committed. The claim logic therefore lives in **`account.create.before`** (synchronous inside `createWithHooks`, `with-hooks.mjs:9-21`, before the insert; a throw propagates to `link-account.mjs:38-44` → `unable_to_link_account`). Binding behaviour of `claimUnverifiedAccountBeforeLink(account, context)`:
- `account.providerId === "credential"` → return (email/password sign-up creates its own credential row).
- `!context` → throw (fail closed; the hook cannot inspect the user).
- `user = findUserById(String(account.userId))`; `!user` → throw; `user.emailVerified` → return.
- `others = findAccounts(userId)`; `others.length === 0` → return (a brand-new OAuth sign-up: `createOAuthUser` inserts the user then its first account; also a legacy user row that never got any account — nothing to revoke).
- provider not in `EMAIL_ATTESTING_PROVIDERS` (`google`) → throw `"Only an email-attesting provider can claim an unverified account"` (Facebook into a placeholder stays refused, before anything is written).
- otherwise delete every row in `others`, then `listSessions`/`deleteSessions` (the claimant's own session does not exist yet), log `{ userId, providerId, removedAccounts, revokedSessions }`, return.
Composition in `buildDatabaseHooks`: `account.create.before = async (account, ctx) => { await claimUnverifiedAccountBeforeLink(account, ctx); return upgradeAccountBeforeHook ? upgradeAccountBeforeHook(account, ctx) : undefined }` (claim first, then the token-upgrade patch); `account.update.before` keeps only the upgrade hook; no `after` hook. Tests: unit tests of the hook with a mocked `internalAdapter` for every branch above, PLUS an integration test through better-auth's real `createInternalAdapter` (`better-auth/db` export, or `node_modules/.pnpm/better-auth@1.6.22*/node_modules/better-auth/dist/db/internal-adapter.mjs`) over `memoryAdapter`, with `databaseHooks` from a captured `createAuth({})` config, proving: (1) `linkAccount` for a google account into an unverified user that already has a credential row deletes that row and inserts the google row; (2) `linkAccount` for facebook into the same placeholder rejects and inserts nothing; (3) `createOAuthUser` for a brand-new facebook user (emailVerified false) succeeds. If `createInternalAdapter` cannot be imported from a public entry, report NEEDS_CONTEXT instead of guessing.


- [ ] **Step 1: Write the failing hook tests**

Create `packages/auth/__tests__/claim-unverified-account.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { claimUnverifiedAccountAfterLink } = await import("../src/claim-unverified-account")

const USER_ID = "11728999944477963"
const internalAdapter = {
  findUserById: vi.fn(),
  findAccounts: vi.fn(),
  deleteAccount: vi.fn(async () => undefined),
  listSessions: vi.fn(),
  deleteSessions: vi.fn(async () => undefined),
}
const context = { context: { internalAdapter } } as never
const account = (providerId: string) =>
  ({ id: "acc-new", userId: USER_ID, providerId, accountId: "sub" }) as never

beforeEach(() => {
  vi.clearAllMocks()
  internalAdapter.findUserById.mockResolvedValue({ id: USER_ID, emailVerified: false })
  internalAdapter.findAccounts.mockResolvedValue([
    { id: "acc-pwd", providerId: "credential" },
    { id: "acc-new", providerId: "google" },
  ])
  internalAdapter.listSessions.mockResolvedValue([{ token: "s1" }, { token: "s2" }])
})

describe("claimUnverifiedAccountAfterLink", () => {
  test("verified Google link into an unverified user drops its password and sessions", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), context)

    expect(internalAdapter.deleteAccount).toHaveBeenCalledTimes(1)
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-pwd")
    expect(internalAdapter.deleteSessions).toHaveBeenCalledWith(["s1", "s2"])
  })

  test("Facebook (no email_verified) into an unverified user is cleaned the same way", async () => {
    await claimUnverifiedAccountAfterLink(account("facebook"), context)
    expect(internalAdapter.deleteAccount).toHaveBeenCalledWith("acc-pwd")
  })

  test("never deletes the social account that was just created", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.deleteAccount).not.toHaveBeenCalledWith("acc-new")
  })

  test("is a no-op for an already verified user", async () => {
    internalAdapter.findUserById.mockResolvedValue({ id: USER_ID, emailVerified: true })
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.findAccounts).not.toHaveBeenCalled()
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("is a no-op when the created account is the credential provider itself", async () => {
    await claimUnverifiedAccountAfterLink(account("credential"), context)
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("is a no-op without an endpoint context", async () => {
    await claimUnverifiedAccountAfterLink(account("google"), null)
    expect(internalAdapter.findUserById).not.toHaveBeenCalled()
  })

  test("skips the session call when there are no sessions", async () => {
    internalAdapter.listSessions.mockResolvedValue([])
    await claimUnverifiedAccountAfterLink(account("google"), context)
    expect(internalAdapter.deleteSessions).not.toHaveBeenCalled()
  })

  test("fails closed: a cleanup failure propagates so the link is refused", async () => {
    internalAdapter.deleteAccount.mockRejectedValueOnce(new Error("db down"))
    await expect(claimUnverifiedAccountAfterLink(account("google"), context)).rejects.toThrow("db down")
  })
})
```

- [ ] **Step 2: Write the failing config test**

Create `packages/auth/__tests__/account-linking.test.ts` with the `bearer-plugin.test.ts:1-70` scaffolding (keep its `createId: () => "test-id"` utils mock), then:

```ts
describe("createAuth account linking", () => {
  test("trusts social providers, allows linking into an unverified local user, and keeps emails matched", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({})
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      account: { accountLinking: { enabled: boolean; trustedProviders: string[]; requireLocalEmailVerified?: boolean; allowDifferentEmails?: boolean } }
    }
    const linking = config.account.accountLinking
    expect(linking.enabled).toBe(true)
    expect(linking.trustedProviders).toEqual(["google", "facebook"])
    expect(linking.requireLocalEmailVerified).toBe(false)
    expect(linking.allowDifferentEmails).toBeUndefined()
  })

  test("registers the placeholder-claim hook on account.create.after, even with no other hooks configured", async () => {
    const { createAuth } = await import("../src/server")
    const { claimUnverifiedAccountAfterLink } = await import("../src/claim-unverified-account")
    createAuth({})
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      databaseHooks?: { account?: { create?: { after?: unknown; before?: unknown } } }
    }
    expect(config.databaseHooks?.account?.create?.after).toBe(claimUnverifiedAccountAfterLink)
  })

  test("keeps the token-upgrade before hook alongside the after hook", async () => {
    const { createAuth } = await import("../src/server")
    createAuth({ upgradeOAuthAccount: async () => null })
    const config = betterAuthMock.mock.calls.at(-1)?.[0] as {
      databaseHooks?: { account?: { create?: { after?: unknown; before?: unknown }; update?: { before?: unknown } } }
    }
    expect(typeof config.databaseHooks?.account?.create?.before).toBe("function")
    expect(typeof config.databaseHooks?.account?.create?.after).toBe("function")
    expect(typeof config.databaseHooks?.account?.update?.before).toBe("function")
  })
})
```

- [ ] **Step 3: Run both files to verify they fail**

Run: `pnpm --filter @chatbotx.io/auth exec vitest run __tests__/claim-unverified-account.test.ts __tests__/account-linking.test.ts`
Expected: FAIL — module `../src/claim-unverified-account` not found; `requireLocalEmailVerified` undefined; no `after` hook.

- [ ] **Step 4: Implement the hook**

Create `packages/auth/src/claim-unverified-account.ts`:

```ts
import type { BetterAuthOptions } from "better-auth"
import { logger } from "./logger"

type AccountCreateAfterHook = NonNullable<
  NonNullable<
    NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["account"]>["create"]
  >["after"]
>

const CREDENTIAL_PROVIDER = "credential"

/**
 * Runs after better-auth inserts a social `Account` for an EXISTING user
 * (`oauth2/link-account.mjs` links before it marks the user verified, so an
 * unverified user here is a placeholder that never proved the mailbox).
 *
 * With `requireLocalEmailVerified: false` a trusted provider may link into such
 * a placeholder. The provider proved mailbox ownership; whoever created the
 * placeholder did not. So the placeholder's password and sessions are removed
 * before the link completes — otherwise a pre-registered password would start
 * working the moment the real owner's sign-in marks the user verified.
 *
 * Fails closed: if cleanup throws, better-auth refuses the link
 * (`unable_to_link_account`) instead of leaving a live placeholder credential.
 */
export const claimUnverifiedAccountAfterLink: AccountCreateAfterHook = async (
  account,
  context,
) => {
  if (!context || account.providerId === CREDENTIAL_PROVIDER) {
    return
  }
  const { internalAdapter } = context.context
  const userId = String(account.userId)
  const user = await internalAdapter.findUserById(userId)
  if (!user || user.emailVerified) {
    return
  }

  const accounts = await internalAdapter.findAccounts(userId)
  const credentials = accounts.filter(
    (row) => row.providerId === CREDENTIAL_PROVIDER,
  )
  for (const row of credentials) {
    await internalAdapter.deleteAccount(row.id)
  }

  const sessions = await internalAdapter.listSessions(userId)
  if (sessions.length > 0) {
    await internalAdapter.deleteSessions(sessions.map((s) => s.token))
  }

  logger.info(
    {
      userId,
      providerId: account.providerId,
      removedCredentials: credentials.length,
      revokedSessions: sessions.length,
    },
    "Unverified placeholder account claimed by a trusted social sign-in",
  )
}
```

If `listSessions(userId)` requires an `options` argument in this version's types, pass `undefined` explicitly or `{}` — check `better-auth/dist/db/internal-adapter.mjs:93` (`listSessions: async (userId, options)`).

- [ ] **Step 5: Wire the hook and the option in `server.ts`**

Replace `buildDatabaseHooks` (lines 396-458) so the account `after` hook is **always** present:

```ts
import { claimUnverifiedAccountAfterLink } from "./claim-unverified-account"

function buildDatabaseHooks({
  onUserCreated,
  upgradeOAuthAccount,
}: Pick<AuthConfig, "onUserCreated" | "upgradeOAuthAccount">) {
  const userHooks = onUserCreated
    ? { /* unchanged user.create.after block */ }
    : undefined

  const upgradeAccountBeforeHook = upgradeOAuthAccount
    ? /* unchanged */
    : undefined

  return {
    ...(userHooks && { user: userHooks }),
    account: {
      create: {
        ...(upgradeAccountBeforeHook && { before: upgradeAccountBeforeHook }),
        after: claimUnverifiedAccountAfterLink,
      },
      ...(upgradeAccountBeforeHook && {
        update: { before: upgradeAccountBeforeHook },
      }),
    },
  }
}
```

(Remove the early `if (!(onUserCreated || upgradeOAuthAccount)) return` — the account hook no longer depends on config.)

In `accountLinking` (after `trustedProviders`):

```ts
        trustedProviders: [...SOCIAL_PROVIDERS],
        // The local side may be an email/password sign-up that never clicked
        // its verification link, or a Facebook-first user (Facebook never
        // returns `email_verified`). A trusted provider has proven the mailbox,
        // so the local flag must not block the link. The placeholder's own
        // password and sessions are removed by `claimUnverifiedAccountAfterLink`
        // before the link completes, which is what keeps this from being a
        // pre-registration takeover. Emails must still match: the implicit
        // sign-in path looks the user up by the provider email, and the
        // explicit link route keeps `allowDifferentEmails` off.
        requireLocalEmailVerified: false,
```

Rewrite the existing comment at lines 524-527 (it says the flag is "left untouched below") so it points at the new comment instead of contradicting it.

- [ ] **Step 6: Run the tests, suite, typecheck, lint**

Run: `pnpm --filter @chatbotx.io/auth test && pnpm --filter @chatbotx.io/auth exec tsc --noEmit && pnpm --filter builder check-types && npx ultracite check packages/auth/src packages/auth/__tests__`
Expected: green (11 new tests pass).

- [ ] **Step 7: Commit**

```bash
git add packages/auth/src/server.ts packages/auth/src/claim-unverified-account.ts packages/auth/__tests__/claim-unverified-account.test.ts packages/auth/__tests__/account-linking.test.ts
git commit -m "fix(auth): let a trusted social sign-in claim an unverified account and drop its stale password"
```

---

### Task 3: Show the OAuth error on the sign-in page

**Files:**
- Create: `apps/builder/src/features/auth/oauth-error.ts`
- Create: `apps/builder/src/features/auth/components/oauth-error-alert.tsx`
- Modify: `apps/builder/src/features/auth/sign-in.tsx:46-48` (render the alert as the first child of the `grid gap-6` div)
- Modify: all 21 files in `apps/builder/messages/` — new keys under `auth.oauthError`
- Test (new): `apps/builder/__tests__/auth-oauth-error.test.ts`

**Interfaces:**
- Produces: `type OAuthErrorKey = "accountNotLinked" | "unableToLinkAccount" | "sessionExpired" | "accessDenied" | "generic"`, `resolveOAuthErrorKey(searchParams: URLSearchParams, currentOrigin: string): OAuthErrorKey | null`, and `OAUTH_ERROR_MESSAGE_KEYS: Record<OAuthErrorKey, string>` (full translation keys).

- [ ] **Step 1: Write the failing helper test**

Create `apps/builder/__tests__/auth-oauth-error.test.ts`:

```ts
import { describe, expect, test } from "vitest"
import { OAUTH_ERROR_MESSAGE_KEYS, resolveOAuthErrorKey } from "@/features/auth/oauth-error"

const origin = "https://app.example.test"
const params = (query: string) => new URLSearchParams(query)
const nested = (target: string) => `callbackURL=${encodeURIComponent(target)}`

describe("resolveOAuthErrorKey", () => {
  test("reads a direct ?error= code", () => {
    expect(resolveOAuthErrorKey(params("error=account_not_linked"), origin)).toBe("accountNotLinked")
  })

  test("reads the code the proxy hid inside an absolute same-origin callbackURL", () => {
    expect(resolveOAuthErrorKey(params(nested("https://app.example.test/?error=unable_to_link_account")), origin)).toBe("unableToLinkAccount")
  })

  test("reads the code from a relative callbackURL", () => {
    expect(resolveOAuthErrorKey(params(nested("/?error=access_denied")), origin)).toBe("accessDenied")
  })

  test("a direct error wins over a nested one", () => {
    expect(resolveOAuthErrorKey(params(`error=state_mismatch&${nested("/?error=access_denied")}`), origin)).toBe("sessionExpired")
  })

  test.each(["state_mismatch", "state_not_found", "state_invalid"])("maps %s to sessionExpired", (code) => {
    expect(resolveOAuthErrorKey(params(`error=${code}`), origin)).toBe("sessionExpired")
  })

  test.each(["<script>", "constructor", "__proto__", "toString", "hasOwnProperty"])(
    "maps unknown or prototype-named code %s to generic",
    (code) => {
      expect(resolveOAuthErrorKey(params(`error=${encodeURIComponent(code)}`), origin)).toBe("generic")
    },
  )

  test("ignores a callbackURL on a foreign origin", () => {
    expect(resolveOAuthErrorKey(params(nested("https://evil.example/?error=account_not_linked")), origin)).toBeNull()
  })

  test("ignores a malformed callbackURL", () => {
    expect(resolveOAuthErrorKey(params("callbackURL=%ZZ%"), origin)).toBeNull()
    expect(resolveOAuthErrorKey(params(nested("http://[bad")), origin)).toBeNull()
  })

  test("returns null when there is no error", () => {
    expect(resolveOAuthErrorKey(params(nested("/space/1")), origin)).toBeNull()
    expect(resolveOAuthErrorKey(params(""), origin)).toBeNull()
  })

  test("every key has a full translation key", () => {
    expect(Object.keys(OAUTH_ERROR_MESSAGE_KEYS).sort()).toEqual(
      ["accessDenied", "accountNotLinked", "generic", "sessionExpired", "unableToLinkAccount"],
    )
    for (const value of Object.values(OAUTH_ERROR_MESSAGE_KEYS)) {
      expect(value).toMatch(/^auth\.oauthError\.[a-zA-Z]+$/)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter builder exec vitest run __tests__/auth-oauth-error.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/builder/src/features/auth/oauth-error.ts`:

```ts
/**
 * better-auth redirects every OAuth callback failure to
 * `/api/auth/error?error=<code>`; in production that route answers
 * `302 /?error=<code>`, and the sign-in proxy then lands on
 * `/auth/sign-in?callbackURL=https://<host>/?error=<code>`. So the code arrives
 * either directly or nested inside `callbackURL`.
 */
export type OAuthErrorKey =
  | "accountNotLinked"
  | "unableToLinkAccount"
  | "sessionExpired"
  | "accessDenied"
  | "generic"

/** better-auth codes that deserve a specific message; anything else is generic. */
const OAUTH_ERROR_KEYS_BY_CODE: Record<string, OAuthErrorKey> = {
  account_not_linked: "accountNotLinked",
  unable_to_link_account: "unableToLinkAccount",
  account_already_linked_to_different_user: "unableToLinkAccount",
  state_mismatch: "sessionExpired",
  state_not_found: "sessionExpired",
  state_invalid: "sessionExpired",
  access_denied: "accessDenied",
}

/** Exhaustive literal map so `t()` never receives a template string. */
export const OAUTH_ERROR_MESSAGE_KEYS: Record<OAuthErrorKey, string> = {
  accountNotLinked: "auth.oauthError.accountNotLinked",
  unableToLinkAccount: "auth.oauthError.unableToLinkAccount",
  sessionExpired: "auth.oauthError.sessionExpired",
  accessDenied: "auth.oauthError.accessDenied",
  generic: "auth.oauthError.generic",
}

const readNestedError = (
  callbackURL: string | null,
  currentOrigin: string,
): string | null => {
  if (!callbackURL) {
    return null
  }
  try {
    const url = new URL(callbackURL, currentOrigin)
    return url.origin === currentOrigin ? url.searchParams.get("error") : null
  } catch {
    return null
  }
}

export function resolveOAuthErrorKey(
  searchParams: URLSearchParams,
  currentOrigin: string,
): OAuthErrorKey | null {
  const code =
    searchParams.get("error") ??
    readNestedError(searchParams.get("callbackURL"), currentOrigin)
  if (!code) {
    return null
  }
  return Object.hasOwn(OAUTH_ERROR_KEYS_BY_CODE, code)
    ? OAUTH_ERROR_KEYS_BY_CODE[code]
    : "generic"
}
```

Note: `new URLSearchParams("callbackURL=%ZZ%")` does not throw; it yields a literal string that `new URL(...)` resolves relative to the origin with no `error` param → `null`. The test pins that.

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `pnpm --filter builder exec vitest run __tests__/auth-oauth-error.test.ts`
Expected: all passed.

- [ ] **Step 5: Add the translation keys to every locale file**

In `apps/builder/messages/en.json`, inside the existing `"auth": { ... }` object:

```json
"oauthError": {
  "accountNotLinked": "An account with this email already exists and could not be linked. Sign in the way you did before, or contact support.",
  "unableToLinkAccount": "We could not link this sign-in to your account. Please try again or contact support.",
  "sessionExpired": "The sign-in attempt expired. Please try again.",
  "accessDenied": "Sign-in was cancelled.",
  "generic": "Sign-in failed. Please try again."
}
```

`vi.json`:

```json
"oauthError": {
  "accountNotLinked": "Đã có tài khoản dùng email này và không thể liên kết. Hãy đăng nhập theo cách bạn đã dùng trước đây, hoặc liên hệ hỗ trợ.",
  "unableToLinkAccount": "Không thể liên kết lần đăng nhập này với tài khoản của bạn. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
  "sessionExpired": "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  "accessDenied": "Bạn đã huỷ đăng nhập.",
  "generic": "Đăng nhập thất bại. Vui lòng thử lại."
}
```

Add the same five keys, translated into the file's language, to the other 19 files (`ar`, `az`, `da`, `de`, `es`, `fi`, `fr`, `he`, `id`, `it`, `ja`, `nl`, `pt-BR`, `pt-PT`, `ro`, `sv`, `tr`, `zh-CN`, `zh-TW`). Keep the same key order as `en.json`. Then run `pnpm --filter builder i18n:check` — expected: no missing keys.

- [ ] **Step 6: Implement the alert and render it**

Create `apps/builder/src/features/auth/components/oauth-error-alert.tsx`:

```tsx
"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  OAUTH_ERROR_MESSAGE_KEYS,
  type OAuthErrorKey,
  resolveOAuthErrorKey,
} from "../oauth-error"

/** Explains why an OAuth sign-in bounced back here instead of a blank form. */
export const OAuthErrorAlert = () => {
  const t = useTranslations()
  const searchParams = useSearchParams()
  // `window` is read after mount only: this component is server-rendered, and
  // the nested-callbackURL case needs the live origin to stay same-site.
  const [key, setKey] = useState<OAuthErrorKey | null>(null)
  useEffect(() => {
    setKey(resolveOAuthErrorKey(searchParams, window.location.origin))
  }, [searchParams])

  if (!key) {
    return null
  }
  return (
    <Alert role="alert" variant="destructive">
      <AlertDescription>{t(OAUTH_ERROR_MESSAGE_KEYS[key])}</AlertDescription>
    </Alert>
  )
}
```

`packages/ui/src/components/ui/alert.tsx:14` defines `variant="destructive"` and exports `Alert`, `AlertDescription` (line 68).

In `apps/builder/src/features/auth/sign-in.tsx`: add `import { OAuthErrorAlert } from "./components/oauth-error-alert"` and render it as the first child of `<div className="grid gap-6">`:

```tsx
          <div className="grid gap-6">
            <OAuthErrorAlert />
            {activeMethod ? (
```

- [ ] **Step 7: Verify in the browser**

With the builder running, open
`https://localhost:3123/auth/sign-in?callbackURL=https%3A%2F%2Flocalhost%3A3123%2F%3Ferror%3Daccount_not_linked`
Expected: destructive alert with the "account with this email already exists…" text above the sign-in buttons. Open `/auth/sign-in` plain: no alert. Open with `?error=constructor`: the generic message.

- [ ] **Step 8: Lint, typecheck, commit**

Run: `pnpm --filter builder check-types && pnpm --filter builder lint && npx ultracite check apps/builder/src/features/auth apps/builder/__tests__/auth-oauth-error.test.ts`
Expected: green (includes `i18n:check`).

```bash
git add apps/builder/src/features/auth/oauth-error.ts apps/builder/src/features/auth/components/oauth-error-alert.tsx apps/builder/src/features/auth/sign-in.tsx apps/builder/__tests__/auth-oauth-error.test.ts apps/builder/messages/*.json
git commit -m "feat(auth): show why a social sign-in was bounced back to the sign-in page"
```

---

### Task 4: Verify, review once, open the PR with an operator remediation note

**Files:** none new.

- [ ] **Step 1: Full verification**

```bash
pnpm lint
pnpm --filter @chatbotx.io/auth exec tsc --noEmit && pnpm --filter builder check-types
pnpm --filter @chatbotx.io/auth test && pnpm --filter builder exec vitest run __tests__/auth-oauth-error.test.ts
git diff origin/main | grep -E '^\+' | grep -nE 'console\.|debugger|\.only\(' || echo "clean"
```
Expected: all green, `clean`.

- [ ] **Step 2: One combined review pass (Codex + Opus), fix only concrete defects**

Run one Codex `codex exec --sandbox read-only` review and one Opus `code-reviewer` agent over `git diff origin/main`, stating the three root causes, the takeover sequence the hook closes, and the accepted decisions (function `generateId`; `requireLocalEmailVerified: false` **with** the claim hook; fixed allow-list + literal key map). Fix CRITICAL/HIGH/valid MEDIUM findings; no further cycle for style.

- [ ] **Step 3: Push and open a draft PR**

Title: `fix(auth): keep 64-bit ids exact and let social sign-in claim unverified accounts`

Body (Summary / Unchanged / Testing bullets like recent PRs; no production ids, emails or tokens):
- Summary: three root causes, one line each; what changes; no schema or automatic data change.
- Unchanged: email/password sign-up still requires email verification; `allowDifferentEmails` stays off; tenant-scoped adapter and provisioning untouched.
- Testing: the id-precision tests, the hook tests (including fail-closed), the config tests, the error-key tests, browser check of the alert, `pnpm lint` + typechecks.
- **Data state (checked on production, 2026-10-09):** no odd-id user has an existing even neighbour (`select count(*) from "User" a where a.id % 2 = 1 and exists (select 1 from "User" b where b.id in (a.id - 1, a.id + 1))` → 0), so no `Account`/`Session` row was ever written under the wrong user. The 93 odd-id users only had their inserts fail; they sign in again after deploy and get linked correctly. No data change is required.
- **Post-deploy sanity check (optional, read-only):** re-run the count above; it must stay 0. If it ever becomes non-zero, a user with id `n` whose neighbour `n±1` exists needs the misattached rows removed by hand — `findOAuthUser` resolves the provider identity first (`internal-adapter.mjs:419`), so a social `Account` row written under the neighbour keeps selecting the neighbour.
- Users who never got a `credential` row (their sign-up insert failed) must use social sign-in or "forgot password"; verify `sendResetPassword` works for a user with no credential row before pointing them at it.

- [ ] **Step 4: Report**

State what was verified, what was not (no production reproduction; Facebook path exercised only via the hook unit test), the remediation prerequisite above, and that odd-id users need to sign in again after deploy.

## Follow-ups (separate PRs, not in scope)

- Give better-auth a pino-backed `logger` and stop drizzle from printing query params on failure — the current `Failed query` log line includes live Google access tokens and id_tokens.
- `assignLabel` in `inbox_labels/sync.ts` does not enqueue ads-conversion evaluation (noted in PR #1452 review).
