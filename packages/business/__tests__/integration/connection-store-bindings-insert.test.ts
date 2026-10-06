// @vitest-environment node

/**
 * `CONNECTION_STORE_BINDINGS`'s workspace-integration bindings' `insertRow`
 * against a real Postgres — proves the PR #1185 re-review fix for I1:
 * connecting claude/deepseek/gemini/openai/openrouter via the generic
 * credential-strategy flow (`connectFromCredentials`, whose `configFields`
 * only declare `apiKey` — see `credential-providers.ts`'s
 * `makeAiKeyProvider`) no longer 500s on the satellite table's NOT NULL
 * `model`/`maxOutputTokens` columns, and that `openaiCompatible`'s `baseURL`
 * (previously dropped before reaching the insert — see `credentials.ts`'s
 * `extraConfig` fix) is actually persisted alongside its own NOT NULL
 * `defaultModel`/`preset`/`name` defaults.
 *
 * Parametrized over every `CONNECTION_STORE_BINDINGS` key that declares its
 * own `configColumns`/`defaultConfigValues` — the exact mechanism this file
 * guards (a binding-supplied default backfilling a NOT NULL satellite
 * column `pickAllowed` doesn't receive from the caller's bare `config`).
 * Every other registered key (`makeChannelBinding` entries, and
 * `makeWorkspaceIntegrationBinding` entries with no `configColumns`) never
 * exercises `defaultConfigValues`, so forcing them through this same
 * `{ workspaceId, auth, descriptor, config: {} }` shape would either no-op
 * or require fixtures (an `Inbox` row, OAuth-shaped config) unrelated to the
 * bug class this file exists to catch — see `store-bindings.ts` for the
 * full registry.
 *
 * Each `config` passed to `insertRow` below is exactly what
 * `connectFromCredentials` would forward for a bare `{ apiKey }` (or, for
 * `openaiCompatible`, `{ apiKey, baseURL }`) connect request — a mocked `tx`
 * (as `packages/database/__tests__/integration/insert-required-columns.test.ts`
 * uses for repositories) only proves the mock was called correctly; this
 * needs the real column constraints.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import {
  integrationClaudeModel,
  integrationDeepseekModel,
  integrationGeminiModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { eq } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { CONNECTION_STORE_BINDINGS } from "../../src/connection/store-bindings"
import { saveOrInsertSatellite } from "../../src/connection/upsert"
import { ChatbotXException } from "../../src/errors"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (tx: DatabaseClient): Promise<string> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `store-binding-${ownerId}@example.test`,
    name: "Store binding test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Store binding test workspace",
  })
  return workspaceId
}

const testAuth: SecretTextAuthValue = {
  authType: AuthType.secretText,
  secretText: "test-api-key",
}

const getBinding = (provider: keyof typeof CONNECTION_STORE_BINDINGS) => {
  const binding = CONNECTION_STORE_BINDINGS[provider]
  if (!binding) {
    throw new Error(`No store binding registered for ${provider}`)
  }
  return binding
}

/** Reads the inserted satellite row back by its own PK for assertions. */
const loadRow = async <TTable extends PgTable & { id: PgTable["id"] }>(
  tx: DatabaseClient,
  table: TTable,
  id: string,
) => {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1)
  if (!row) {
    throw new Error("Inserted row was not found")
  }
  return row
}

describe.skipIf(!databaseUrl)(
  "CONNECTION_STORE_BINDINGS workspace-integration bindings insert against Postgres",
  () => {
    test.each([
      {
        provider: "claude" as const,
        displayName: "Claude",
        config: {},
        table: integrationClaudeModel,
        model: "claude-sonnet-4-6",
        maxOutputTokens: 1024,
      },
      {
        provider: "deepseek" as const,
        displayName: "DeepSeek",
        config: {},
        table: integrationDeepseekModel,
        model: "deepseek-flash",
        maxOutputTokens: 1024,
      },
      {
        provider: "gemini" as const,
        displayName: "Gemini",
        config: {},
        table: integrationGeminiModel,
        model: "gemini-3.5-flash",
        maxOutputTokens: 1024,
      },
      {
        provider: "openai" as const,
        displayName: "OpenAI",
        config: {},
        table: integrationOpenaiModel,
        model: "gpt-5.4-mini",
        maxOutputTokens: 1024,
      },
      {
        provider: "openrouter" as const,
        displayName: "OpenRouter",
        config: {},
        table: integrationOpenrouterModel,
        model: "openai/gpt-5.4-mini",
        maxOutputTokens: 1024,
      },
    ])("$provider: a bare apiKey connect fills the NOT NULL model/maxOutputTokens defaults", async ({
      provider,
      displayName,
      config,
      table,
      model,
      maxOutputTokens,
    }) => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding(provider).insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: { sourceId: "workspace", displayName },
            config,
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(tx, table, inserted.id)
        expect(row.model).toBe(model)
        expect(row.maxOutputTokens).toBe(maxOutputTokens)
      })
    })

    test("openaiCompatible: an apiKey+baseURL connect persists baseURL and fills the NOT NULL defaultModel/preset/name defaults", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const inserted = await getBinding("openaiCompatible").insertRow(
          {
            workspaceId,
            auth: testAuth,
            descriptor: {
              sourceId: "workspace",
              displayName: "OpenAI-compatible",
            },
            config: { baseURL: "https://example.com/v1" },
          },
          tx,
        )
        expect(inserted.integrationId).toBeTruthy()
        const row = await loadRow(
          tx,
          integrationOpenaiCompatibleModel,
          inserted.id,
        )
        expect(row.baseURL).toBe("https://example.com/v1")
        expect(row.defaultModel).toBe("gpt-4o-mini")
        expect(row.preset).toBe("custom")
        expect(row.name).toBe("OpenAI-compatible")
      })
    })
  },
)

/**
 * `IntegrationOpenaiCompatible_workspaceId_preset_key` is a PARTIAL unique
 * index (`where preset <> 'custom'`) guarding one connection per
 * non-custom preset per workspace. The legacy `integrationOpenaiCompatibleService
 * .connect` mapped a violation of this index to a localized
 * `openaiCompatible.validation.presetAlreadyConnected` field error via its
 * own `ensurePresetAvailable` check + catch. The replacement
 * `connectFromCredentials` path drives `saveOrInsertSatellite`
 * (`../../src/connection/upsert.ts`) instead, which only maps a duplicate
 * insert to `connectionAlreadyConnectedException` when the provider's
 * `CONNECTION_STORE_BINDINGS` entry declares a `duplicateConstraint` —
 * proves that declaring it for `openaiCompatible` is both necessary (a bare
 * `saveOrInsertSatellite` call today lets the raw Postgres unique-violation
 * error propagate) and sufficient (the generic `isUniqueViolationError`
 * constraint-name check in `upsert.ts` works identically against this
 * PARTIAL index as it already does against messenger/instagram's full ones
 * — Postgres reports the same violated-index name in `error.cause.constraint`
 * either way).
 */
describe.skipIf(!databaseUrl)(
  "CONNECTION_STORE_BINDINGS.openaiCompatible duplicate non-custom preset against Postgres",
  () => {
    test("a second non-custom-preset connect in the same workspace maps the partial unique index violation to connectionAlreadyConnectedException instead of leaking the raw Postgres error", async () => {
      await withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const store = getBinding("openaiCompatible")

        await saveOrInsertSatellite({
          tx,
          workspaceId,
          kind: "integration",
          auth: testAuth,
          descriptor: {
            sourceId: "https://first.example.com/v1",
            displayName: "First",
          },
          extraConfig: {
            baseURL: "https://first.example.com/v1",
            preset: "lmstudio",
          },
          store,
        })

        const duplicateAttempt = saveOrInsertSatellite({
          tx,
          workspaceId,
          kind: "integration",
          auth: testAuth,
          descriptor: {
            sourceId: "https://second.example.com/v1",
            displayName: "Second",
          },
          extraConfig: {
            baseURL: "https://second.example.com/v1",
            preset: "lmstudio",
          },
          store,
        })

        await expect(duplicateAttempt).rejects.toBeInstanceOf(ChatbotXException)
        await expect(duplicateAttempt).rejects.toMatchObject({
          code: "connectionAlreadyConnected",
        })
      })
    })
  },
)
