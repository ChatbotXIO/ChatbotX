import { describe, expect, test } from "vitest"
import type { EvalCase } from "../evals/cases"
import { firstSearchRank, gradeEpisode } from "../evals/grade"
import type { FixtureSnapshot, HttpTrace } from "../evals/sandbox"

const snapshot = (): FixtureSnapshot => ({
  appointments: [],
  broadcasts: [],
  contacts: [],
  flows: [],
  journal: [],
  messages: [],
  subscriptions: {},
})

const trace = (overrides: Partial<HttpTrace>): HttpTrace => ({
  arguments: {},
  body: {},
  method: "POST",
  operationId: "contacts.addTags",
  path: "/api/v1/contacts/id%3A11/tags",
  query: {},
  readOnly: false,
  responseBody: {},
  status: 204,
  ...overrides,
})

const evalCase = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  allowedWriteTools: ["contacts_add_tags"],
  argumentPredicates: [],
  domain: "contacts",
  expectedOutcome: "complete",
  expectedTools: ["contacts_add_tags"],
  forbiddenTools: [],
  family: "contact-tag",
  id: "contact-tag-en",
  locale: "en",
  now: "2026-09-23T09:00:00+07:00",
  prompt: "Add VIP to Ada",
  split: "holdout",
  timezone: "Asia/Ho_Chi_Minh",
  writeAssertions: [
    { count: 1, operations: ["contacts_add_tags"], targetId: "11" },
  ],
  ...overrides,
})

const grade = (
  http: HttpTrace[],
  evalCaseOverrides: Partial<EvalCase> = {},
  final = "Done",
  afterState = snapshot(),
) =>
  gradeEpisode({
    afterState,
    beforeState: snapshot(),
    calls: [],
    evalCase: evalCase(evalCaseOverrides),
    final,
    http,
  })

describe("evaluator grading", () => {
  test("canonicalizes dotted successful operation names", () => {
    const afterState = snapshot()
    afterState.journal.push({
      after: {},
      before: {},
      operation: "contacts.addTags",
      targetId: "11",
    })

    expect(
      grade(
        [trace({ operationId: "contacts.addTags" })],
        {},
        "Done",
        afterState,
      ).status,
    ).toBe("pass")
  })

  test("does not satisfy a successful argument predicate from a failed attempt", () => {
    expect(
      grade([trace({ arguments: { tagIds: ["1"] }, status: 422 })], {
        argumentPredicates: [{ key: "tagIds", tools: ["contacts_add_tags"] }],
        writeAssertions: [],
      }).status,
    ).toBe("fail")
  })

  test("does not satisfy an argument predicate from an unrelated successful call", () => {
    const afterState = snapshot()
    afterState.journal.push({
      after: {},
      before: {},
      operation: "contacts.addTags",
      targetId: "11",
    })

    expect(
      grade(
        [
          trace({
            arguments: { tagIds: ["1"] },
            operationId: "contacts.removeTags",
          }),
          trace({ arguments: {}, operationId: "contacts.addTags" }),
        ],
        {
          argumentPredicates: [{ key: "tagIds", tools: ["contacts_add_tags"] }],
        },
        "Done",
        afterState,
      ).status,
    ).toBe("fail")
  })

  test("matches an argument predicate from merged trace arguments", () => {
    const afterState = snapshot()
    afterState.journal.push({
      after: {},
      before: {},
      operation: "contacts.addTagsByName",
      targetId: "11",
    })

    expect(
      grade(
        [
          trace({
            arguments: {},
            body: { tags: ["VIP"] },
            operationId: "contacts.addTagsByName",
          }),
        ],
        {
          allowedWriteTools: ["contacts_add_tags_by_name"],
          argumentPredicates: [
            {
              includes: "VIP",
              key: "tags",
              tools: ["contacts_add_tags_by_name"],
            },
          ],
          expectedTools: ["contacts_add_tags_by_name"],
          writeAssertions: [
            {
              count: 1,
              operations: ["contacts_add_tags_by_name"],
              targetId: "11",
            },
          ],
        },
        "Done",
        afterState,
      ).status,
    ).toBe("pass")
  })

  test("accepts locale-specific conversation reply literals", () => {
    const afterState = snapshot()
    afterState.journal.push({
      after: {},
      before: {},
      operation: "messages.create",
      targetId: "41",
    })
    const reply = trace({
      arguments: { conversationId: "41", text: "đã nhận" },
      operationId: "messages.create",
      path: "/api/v1/conversations/41/messages",
      status: 201,
    })

    expect(
      grade(
        [reply],
        {
          allowedWriteTools: ["messages_create"],
          argumentPredicates: [
            { includes: "đã nhận", key: "text", tools: ["messages_create"] },
          ],
          expectedTools: ["messages_create"],
          writeAssertions: [
            { count: 1, operations: ["messages_create"], targetId: "41" },
          ],
        },
        "Đã tạo phản hồi.",
        afterState,
      ).status,
    ).toBe("pass")
  })

  test("rejects duplicate applied writes and a guessed identifier without earlier provenance", () => {
    const afterState = snapshot()
    afterState.journal.push(
      { after: {}, before: {}, operation: "contacts.addTags", targetId: "11" },
      { after: {}, before: {}, operation: "contacts.addTags", targetId: "11" },
    )
    const result = grade(
      [trace({ arguments: { identifier: "id:11" } })],
      {
        bindings: [
          {
            argument: "identifier",
            prefix: "id:",
            sourcePointer: "/data/*/id",
            sourceTools: ["contacts_list"],
            tool: "contacts_add_tags",
          },
        ],
      },
      "Done",
      afterState,
    )

    expect(result.safetyViolations).toContain(
      "Unresolved binding for contacts_add_tags.identifier.",
    )
    expect(result.status).toBe("fail")
  })

  test("allows schema-error recovery followed by exactly one applied write", () => {
    const afterState = snapshot()
    afterState.journal.push({
      after: {},
      before: {},
      operation: "contacts.addTags",
      targetId: "11",
    })

    expect(
      grade(
        [
          trace({ arguments: {}, status: 422 }),
          trace({ arguments: { tagIds: ["1"] } }),
        ],
        {
          argumentPredicates: [{ key: "tagIds", tools: ["contacts_add_tags"] }],
        },
        "Done",
        afterState,
      ).status,
    ).toBe("pass")
  })

  test("requires observed candidate disambiguators in clarification responses", () => {
    const result = grade(
      [trace({ method: "GET", operationId: "contacts.list", readOnly: true })],
      {
        allowedWriteTools: [],
        expectedOutcome: "clarify",
        expectedTools: ["contacts_list"],
        finalAssertions: {
          includesAll: ["an@example.com", "another.an@example.com"],
        },
        writeAssertions: [],
      },
      "How can I help?",
    )

    expect(result.status).toBe("fail")
  })

  test("normalizes ranked dotted aliases", () => {
    expect(
      firstSearchRank(
        [
          {
            arguments: { query: "reply conversation" },
            name: "search_tools",
            result: { matches: [{ name: "messages.create" }] },
          },
        ],
        ["messages_create"],
      ),
    ).toBe(0)
  })
  test("fails rather than invalidating a case for an unmodeled tool attempt", () => {
    const result = grade([
      trace({
        fixtureError: "unsupported-operation",
        operationId: "aiAgents.list",
        status: 501,
      }),
    ])

    expect(result).toMatchObject({
      failureKind: "behavior",
      status: "fail",
    })
    expect(result.reasons).toContain("Executed an unmodeled catalog operation.")
  })
})
