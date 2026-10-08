import { describe, expect, test } from "vitest"
import { type EvalCase, materializeCases } from "../evals/cases"
import {
  assertComparableManifests,
  type EvalManifest,
  validateCaseCoverage,
} from "../evals/run-contract"
import { fixtureOperationIds } from "../evals/sandbox"

const manifest = (): EvalManifest => ({
  corpusHash: "corpus",
  exposures: ["default", "meta-only"],
  fixtureOperations: ["contacts_add_tags"],
  generatedAt: "2026-09-23T00:00:00.000Z",
  harnessHash: "harness",
  instructionsHash: "instructions",
  modelIds: ["gpt-4.1-mini"],
  phase: "baseline",
  repeat: 3,
  runtimeSpecHash: "runtime-spec",
  seed: 20_260_923,
  selectedCaseIds: ["tag-en"],
  sourceHash: "source",
  specHash: "spec",
})

const evalCase: EvalCase = {
  argumentPredicates: [],
  bindings: [
    {
      argument: "identifier",
      sourcePointer: "/data/*/id",
      sourceTools: ["contacts_list"],
      tool: "contacts_add_tags",
    },
  ],
  domain: "contacts",
  expectedOutcome: "complete",
  expectedTools: ["contacts_add_tags"],
  forbiddenTools: ["contacts_set_tags"],
  family: "tag",
  id: "tag-en",
  locale: "en",
  now: "2026-09-23T09:00:00+07:00",
  prompt: "Add VIP",
  sequence: [["contacts_list"], ["contacts_add_tags"]],
  searchQueries: [
    {
      expectedTools: ["sequences_list"],
      query: "list sequences",
    },
  ],
  split: "holdout",
  timezone: "Asia/Ho_Chi_Minh",
}

describe("evaluation runner contracts", () => {
  test("permits source and instructions snapshots to differ", () => {
    const baseline = manifest()
    const candidate = {
      ...manifest(),
      instructionsHash: "candidate",
      sourceHash: "candidate-source",
    }

    expect(() => assertComparableManifests(baseline, candidate)).not.toThrow()
  })

  test("rejects a corpus compatibility mismatch", () => {
    expect(() =>
      assertComparableManifests(manifest(), {
        ...manifest(),
        corpusHash: "other",
      }),
    ).toThrow("corpusHash")
  })

  test("preflights expected, forbidden, sequence, and binding operations", () => {
    const failures = validateCaseCoverage(
      [evalCase],
      new Set(["contacts_add_tags", "contacts_list"]),
      new Set(["contacts_add_tags", "contacts_list"]),
    )

    expect(failures).toContain("tag-en: missing catalog tool contacts_set_tags")
    expect(failures).toContain(
      "tag-en: missing fixture operation contacts_set_tags",
    )
    expect(failures).toContain("tag-en: missing catalog tool sequences_list")
    expect(failures).toContain(
      "tag-en: missing fixture operation sequences_list",
    )
  })

  test("defines fixture-backed channel and integration connection workflows", () => {
    const connectionCases = materializeCases().filter(
      (evalCase) => evalCase.domain === "connections",
    )
    const catalogOperations = new Set([
      "connection_providers_list",
      "connections_list",
      "connections_create",
      "connect_sessions_get",
      "connect_sessions_connect_targets",
    ])

    expect(connectionCases).toHaveLength(25)
    expect(
      validateCaseCoverage(
        connectionCases,
        catalogOperations,
        fixtureOperationIds(),
      ),
    ).toEqual([])
    expect(
      connectionCases.filter(
        (evalCase) => evalCase.family === "connection-messenger-finish",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bindings: [
            expect.objectContaining({
              argument: "targetIds",
              sourcePointer: "/targets/0/id",
              sourceTools: ["connect_sessions_get"],
              tool: "connect_sessions_connect_targets",
            }),
          ],
          sequence: [
            ["connect_sessions_get"],
            ["connect_sessions_connect_targets"],
          ],
        }),
      ]),
    )
  })
})
