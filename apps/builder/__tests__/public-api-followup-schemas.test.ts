// @vitest-environment node
import { describe, expect, test } from "vitest"
import { listBotFieldsPublicRequest } from "@/features/bot-fields/schema/query"
import { previewBroadcastAudiencePublicRequest } from "@/features/broadcasts/schema/public"
import {
  bulkTagByStatsPublicRequest,
  bulkUnsubscribeSequencesPublicRequest,
} from "@/features/contacts/schema/public/bulk"
import { startProductImportPublicRequest } from "@/features/products/schema/public"

describe("broadcast audience requests", () => {
  test("accept an empty selection (it simply matches no inbox)", () => {
    expect(previewBroadcastAudiencePublicRequest.safeParse({}).success).toBe(
      true,
    )
  })

  test("reject a window that ends before it starts", () => {
    const result = previewBroadcastAudiencePublicRequest.safeParse({
      audienceRangeStart: 10,
      audienceRangeEnd: 5,
    })
    expect(result.success).toBe(false)
  })

  test("reject a malformed contactFilter instead of ignoring it", () => {
    const result = previewBroadcastAudiencePublicRequest.safeParse({
      contactFilter: "{not json",
    })
    expect(result.success).toBe(false)
  })

  test("preview caps perPage at 50 and pages from 1", () => {
    expect(
      previewBroadcastAudiencePublicRequest.safeParse({ perPage: 51 }).success,
    ).toBe(false)
    expect(
      previewBroadcastAudiencePublicRequest.safeParse({ page: 0 }).success,
    ).toBe(false)
    expect(
      previewBroadcastAudiencePublicRequest.safeParse({ page: 2, perPage: 50 })
        .success,
    ).toBe(true)
  })
})

describe("bulkTagByStatsPublicRequest", () => {
  test("defaults excludedContactIds to none", () => {
    const parsed = bulkTagByStatsPublicRequest.parse({
      source: "broadcast",
      broadcastId: "1",
      eventType: "message:seen",
      tags: ["Engaged"],
    })
    expect(parsed.excludedContactIds).toEqual([])
  })

  test("requires the fields of the chosen source", () => {
    expect(
      bulkTagByStatsPublicRequest.safeParse({
        source: "sequenceStep",
        sequenceId: "1",
        eventType: "message:sent",
        tags: ["x"],
      }).success,
    ).toBe(false)
  })

  test("rejects events that have no per-recipient predicate (they would tag the delivered audience)", () => {
    for (const eventType of ["message:received", "flow:ref", "read"]) {
      expect(
        bulkTagByStatsPublicRequest.safeParse({
          source: "broadcast",
          broadcastId: "1",
          eventType,
          tags: ["x"],
        }).success,
      ).toBe(false)
      expect(
        bulkTagByStatsPublicRequest.safeParse({
          source: "sequenceStep",
          sequenceId: "1",
          stepId: "2",
          eventType,
          tags: ["x"],
        }).success,
      ).toBe(false)
    }
  })

  test("accepts every tracked event for a broadcast and a sequence step", () => {
    for (const eventType of [
      "message:sent",
      "message:delivered",
      "message:seen",
      "message:failed",
      "flow:clicked",
    ]) {
      expect(
        bulkTagByStatsPublicRequest.safeParse({
          source: "broadcast",
          broadcastId: "1",
          eventType,
          tags: ["x"],
        }).success,
      ).toBe(true)
      expect(
        bulkTagByStatsPublicRequest.safeParse({
          source: "sequenceStep",
          sequenceId: "1",
          stepId: "2",
          eventType,
          tags: ["x"],
        }).success,
      ).toBe(true)
    }
  })

  test("a comment automation still accepts its missed event", () => {
    expect(
      bulkTagByStatsPublicRequest.safeParse({
        source: "commentAutomation",
        automationId: "1",
        eventType: "comment:missed",
        tags: ["x"],
      }).success,
    ).toBe(true)
  })

  test("rejects an unknown source and an empty tag list", () => {
    expect(
      bulkTagByStatsPublicRequest.safeParse({ source: "flow", tags: ["x"] })
        .success,
    ).toBe(false)
    expect(
      bulkTagByStatsPublicRequest.safeParse({
        source: "broadcast",
        broadcastId: "1",
        eventType: "message:seen",
        tags: [],
      }).success,
    ).toBe(false)
  })
})

describe("bulkUnsubscribeSequencesPublicRequest", () => {
  test("needs at least one contact and one sequence, at most 20 sequences", () => {
    const base = { contactIds: ["1"], sequenceIds: ["2"] }
    expect(bulkUnsubscribeSequencesPublicRequest.safeParse(base).success).toBe(
      true,
    )
    expect(
      bulkUnsubscribeSequencesPublicRequest.safeParse({
        ...base,
        sequenceIds: [],
      }).success,
    ).toBe(false)
    expect(
      bulkUnsubscribeSequencesPublicRequest.safeParse({
        ...base,
        sequenceIds: Array.from({ length: 21 }, (_, i) => String(i + 1)),
      }).success,
    ).toBe(false)
  })
})

describe("startProductImportPublicRequest", () => {
  test("requires the name column and defaults createMissingCategories to true", () => {
    const parsed = startProductImportPublicRequest.parse({
      fileId: "1",
      format: "xlsx",
      columnMap: { name: "Name" },
    })
    expect(parsed.createMissingCategories).toBe(true)
    expect(
      startProductImportPublicRequest.safeParse({
        fileId: "1",
        format: "xlsx",
        columnMap: {},
      }).success,
    ).toBe(false)
  })

  test("only csv and xlsx are accepted", () => {
    expect(
      startProductImportPublicRequest.safeParse({
        fileId: "1",
        format: "json",
        columnMap: { name: "Name" },
      }).success,
    ).toBe(false)
  })
})

describe("listBotFieldsPublicRequest", () => {
  test("accepts name, root folder and sort filters", () => {
    const parsed = listBotFieldsPublicRequest.parse({
      name: "tok",
      folderId: "0",
      sort: [{ id: "name", desc: false }],
    })
    expect(parsed.folderId).toBe("0")
  })
})
