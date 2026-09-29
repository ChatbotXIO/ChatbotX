import { describe, expect, test } from "vitest"
import {
  buildFilterValueLabels,
  collectFilterValueIds,
} from "@/features/contact-filter/lib/filter-value-labels"
import type { ResolveFilterValueLabelsResponse } from "@/features/contact-filter/schema/value-labels"
import {
  isFilterValueId,
  MAX_FILTER_VALUE_LABEL_IDS,
  resolveFilterValueLabelsRequest,
} from "@/features/contact-filter/schema/value-labels"

const resolved = (
  overrides: Partial<ResolveFilterValueLabelsResponse> = {},
): ResolveFilterValueLabelsResponse => ({
  tags: [],
  sequences: [],
  broadcasts: [],
  reflinks: [],
  inboxes: [],
  members: [],
  inboxTeams: [],
  ...overrides,
})

describe("collectFilterValueIds", () => {
  test("groups the ids of id-backed fields by lookup type", () => {
    expect(
      collectFilterValueIds([
        { field: "tags", value: ["1", "2"] },
        { field: "inbox", value: ["3"] },
        { field: "broadcastSent", value: ["4"] },
        { field: "broadcastClicked", value: ["5", "4"] },
      ]),
    ).toEqual({
      tags: ["1", "2"],
      inboxes: ["3"],
      broadcasts: ["4", "5"],
    })
  })

  test("splits assignee values into members and teams and skips the fixed value", () => {
    expect(
      collectFilterValueIds([
        {
          field: "conversationAssigned",
          value: ["u_7", "t_3", "unassigned"],
        },
      ]),
    ).toEqual({ members: ["7"], inboxTeams: ["3"] })
  })

  test("ignores fields that are not id-backed and conditions without a value", () => {
    expect(
      collectFilterValueIds([
        { field: "fullName", value: "titan" },
        { field: "gender", value: "male" },
        { field: "tags" },
      ]),
    ).toBeUndefined()
  })

  test("skips values that are not numeric ids so one bad value cannot fail the lookup", () => {
    expect(
      collectFilterValueIds([
        {
          field: "tags",
          value: ["t1", "12", "0x10", "1.5", "-4", "99999999999999999999"],
        },
        { field: "conversationAssigned", value: ["u_undefined", "u_7", "t_"] },
      ]),
    ).toEqual({ tags: ["12"], members: ["7"] })
  })

  test("returns undefined when a type holds more ids than one request allows", () => {
    const idsOf = (count: number) =>
      Array.from({ length: count }, (_, index) => String(index + 1))

    expect(
      collectFilterValueIds([
        { field: "tags", value: idsOf(MAX_FILTER_VALUE_LABEL_IDS) },
      ])?.tags,
    ).toHaveLength(MAX_FILTER_VALUE_LABEL_IDS)
    expect(
      collectFilterValueIds([
        { field: "tags", value: idsOf(MAX_FILTER_VALUE_LABEL_IDS + 1) },
      ]),
    ).toBeUndefined()
  })
})

describe("filter value id validation", () => {
  test("accepts canonical ids up to the bigint maximum only", () => {
    expect(isFilterValueId("9223372036854775807")).toBe(true)
    expect(isFilterValueId("9223372036854775808")).toBe(false)
    for (const invalid of ["", "007", "-1", "1.5", "abc", "u_1"]) {
      expect(isFilterValueId(invalid)).toBe(false)
    }
  })

  test("the request schema rejects an invalid id instead of reaching the database", () => {
    const valid = { workspaceId: "1", tags: ["12"] }

    expect(resolveFilterValueLabelsRequest.safeParse(valid).success).toBe(true)
    expect(
      resolveFilterValueLabelsRequest.safeParse({ ...valid, tags: ["abc"] })
        .success,
    ).toBe(false)
    const ids = (count: number) =>
      Array.from({ length: count }, (_, index) => String(index + 1))
    expect(
      resolveFilterValueLabelsRequest.safeParse({
        ...valid,
        tags: ids(MAX_FILTER_VALUE_LABEL_IDS),
      }).success,
    ).toBe(true)
    expect(
      resolveFilterValueLabelsRequest.safeParse({
        ...valid,
        tags: ids(MAX_FILTER_VALUE_LABEL_IDS + 1),
      }).success,
    ).toBe(false)
  })
})

describe("buildFilterValueLabels", () => {
  test("turns looked-up names into options keyed by the filter value", () => {
    expect(
      buildFilterValueLabels(
        "tags",
        resolved({ tags: [{ id: "t1", name: "VIP" }] }),
        undefined,
      ),
    ).toEqual([{ value: "t1", label: "VIP" }])
  })

  test("re-applies the assignee prefixes and keeps the fixed option", () => {
    expect(
      buildFilterValueLabels(
        "assignees",
        resolved({
          members: [{ id: "7", name: "Alice" }],
          inboxTeams: [{ id: "3", name: "Sales" }],
        }),
        [
          { label: "Unassigned", value: "unassigned" },
          { label: "Agents", value: "agents" },
        ],
      ),
    ).toEqual([
      { value: "u_7", label: "Alice" },
      { value: "t_3", label: "Sales" },
      { label: "Unassigned", value: "unassigned" },
    ])
  })

  test("is empty, not undefined, when everything referenced was deleted", () => {
    expect(buildFilterValueLabels("tags", resolved(), undefined)).toEqual([])
  })

  test("returns undefined for option sources that are not looked up by id", () => {
    expect(buildFilterValueLabels("gender", resolved(), [])).toBeUndefined()
  })
})
