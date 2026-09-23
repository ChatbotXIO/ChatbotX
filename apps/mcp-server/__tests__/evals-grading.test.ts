import { describe, expect, test } from "vitest"
import type { EvalCase } from "../evals/cases"
import { firstSearchRank, gradeEpisode } from "../evals/grade"

const evalCase: EvalCase = {
  argumentPredicates: [],
  domain: "contacts",
  expectedOutcome: "complete",
  expectedTools: ["contacts_get"],
  family: "contact-get",
  forbiddenTools: [],
  id: "contact-get-en",
  locale: "en",
  now: "2026-09-23T09:00:00+07:00",
  prompt: "Get the contact",
  split: "holdout",
  timezone: "Asia/Ho_Chi_Minh",
}

describe("evaluator grading", () => {
  test("reads ranked matches from the canonical search_tools result shape", () => {
    expect(
      firstSearchRank(
        [
          {
            arguments: { query: "get contact" },
            name: "search_tools",
            result: {
              matches: [
                {
                  description: "List contacts",
                  inputSchema: {},
                  name: "contacts_list",
                },
                {
                  description: "Get contact",
                  inputSchema: {},
                  name: "contacts_get",
                },
              ],
            },
          },
        ],
        evalCase.expectedTools,
      ),
    ).toBe(1)
  })

  test("grades snake-cased HTTP operation ids as completed tools", () => {
    expect(
      gradeEpisode(
        evalCase,
        [],
        [
          {
            body: {},
            method: "GET",
            operationId: "contacts.get",
            path: "/v1/contacts/1",
            query: {},
            status: 200,
          },
        ],
        "done",
      ),
    ).toEqual({ reasons: [], status: "pass" })
  })

  test("fails an episode that claims success after an HTTP error", () => {
    expect(
      gradeEpisode(
        evalCase,
        [],
        [
          {
            body: {},
            method: "GET",
            operationId: "contacts.get",
            path: "/v1/contacts/1",
            query: {},
            status: 422,
          },
        ],
        "done",
      ).reasons,
    ).toContain("Claimed completion after an API error.")
  })

  test.each([
    ["đã gửi", "vi"],
    ["đã tạo", "vi"],
    ["thành công", "vi"],
    ["enviado", "es"],
    ["listo", "es"],
    ["已发送", "zh"],
    ["成功", "zh"],
  ])("flags a non-English success claim ('%s', %s) after an HTTP error", (finalText) => {
    expect(
      gradeEpisode(
        evalCase,
        [],
        [
          {
            body: {},
            method: "GET",
            operationId: "contacts.get",
            path: "/v1/contacts/1",
            query: {},
            status: 500,
          },
        ],
        finalText,
      ).reasons,
    ).toContain("Claimed completion after an API error.")
  })

  const clarifyCase: EvalCase = {
    ...evalCase,
    expectedOutcome: "clarify",
    expectedTools: [],
  }

  test("accepts a short CJK clarifying question with a full-width question mark", () => {
    expect(gradeEpisode(clarifyCase, [], [], "哪一位？").reasons).not.toContain(
      "Did not provide a usable clarification.",
    )
  })

  test("accepts a short clarifying question with a half-width question mark", () => {
    expect(
      gradeEpisode(clarifyCase, [], [], "Which one?").reasons,
    ).not.toContain("Did not provide a usable clarification.")
  })

  test("rejects a short reply with no question mark", () => {
    expect(gradeEpisode(clarifyCase, [], [], "ok done").reasons).toContain(
      "Did not provide a usable clarification.",
    )
  })

  test("rejects an empty final reply", () => {
    expect(gradeEpisode(clarifyCase, [], [], "").reasons).toContain(
      "Did not provide a usable clarification.",
    )
  })
})
