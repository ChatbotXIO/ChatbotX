import { pipelineSettingsSchema } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  buildPermissionChanges,
  buildPipelineUpdate,
  draftErrors,
  draftFromPipeline,
  NO_PERMISSIONS,
  rebaseDraft,
} from "../settings-draft"
import type { SettingsPipeline } from "../use-save-settings"

const pipeline: SettingsPipeline = {
  id: "9",
  name: "Sales",
  referenceName: "sales",
  currency: "USD",
  settings: pipelineSettingsSchema.parse({ maxOpenItemsPerContact: 3 }),
}

const base = draftFromPipeline(pipeline)

describe("buildPipelineUpdate", () => {
  test("an untouched draft saves nothing", () => {
    expect(buildPipelineUpdate(base, draftFromPipeline(pipeline))).toBe(null)
  })

  test("only the changed groups are sent", () => {
    const draft = draftFromPipeline(pipeline)
    const update = buildPipelineUpdate(base, {
      ...draft,
      cardElements: { ...draft.cardElements, cardId: false },
      statusLabels: { ...draft.statusLabels, won: "Closed" },
    })
    expect(update).toEqual({
      settings: {
        cardElements: { ...draft.cardElements, cardId: false },
        statusLabels: { ...draft.statusLabels, won: "Closed" },
      },
    })
  })

  test("reference name, flag and limit are sent; unchecking the limit clears it", () => {
    const draft = draftFromPipeline(pipeline)
    expect(
      buildPipelineUpdate(base, {
        ...draft,
        referenceName: "deals",
        assignContactOnAssign: true,
        limit: { enabled: false, value: "3" },
      }),
    ).toEqual({
      referenceName: "deals",
      settings: { assignContactOnAssign: true, maxOpenItemsPerContact: null },
    })
  })
})

describe("rebaseDraft", () => {
  // Another admin changed the status labels and the board refetched while
  // this sheet was open with only a card element edited.
  const next = {
    ...base,
    statusLabels: { ...base.statusLabels, won: "Closed" },
    limit: { enabled: true, value: "5" },
  }

  test("untouched fields follow the refetch, edited ones keep the user's value", () => {
    const draft = {
      ...base,
      cardElements: { ...base.cardElements, cardId: false },
      limit: { enabled: true, value: "7" },
    }
    expect(rebaseDraft(draft, base, next)).toEqual({
      ...next,
      cardElements: { ...base.cardElements, cardId: false },
      limit: { enabled: true, value: "7" },
    })
  })

  test("a refetch alone never becomes a change to save", () => {
    const rebased = rebaseDraft(base, base, next)
    expect(buildPipelineUpdate(next, rebased)).toBe(null)
  })

  test("only the user's edit is sent after a refetch", () => {
    const draft = { ...base, assignContactOnAssign: true }
    expect(buildPipelineUpdate(next, rebaseDraft(draft, base, next))).toEqual({
      settings: { assignContactOnAssign: true },
    })
  })
})

describe("baseline after a save", () => {
  // The user sent a card element change; while it was saving, another admin's
  // limit change arrived through a refetch (base and draft already rebased).
  test("keeps the refetched value of a field the save did not send", () => {
    const sentBase = base
    const sentDraft = {
      ...base,
      cardElements: { ...base.cardElements, cardId: false },
    }
    const refetched = { ...base, limit: { enabled: true, value: "5" } }
    const draftNow = rebaseDraft(sentDraft, sentBase, refetched)

    const savedBase = rebaseDraft(sentDraft, sentBase, refetched)

    expect(savedBase.limit).toEqual({ enabled: true, value: "5" })
    expect(savedBase.cardElements.cardId).toBe(false)
    expect(buildPipelineUpdate(savedBase, draftNow)).toBe(null)
  })
})

describe("draftErrors", () => {
  const valid = draftFromPipeline(pipeline)

  test("an unchecked limit is valid whatever its input holds", () => {
    expect(
      draftErrors({ ...valid, limit: { enabled: false, value: "" } }).limit,
    ).toBe(false)
  })

  test("a saved pipeline's draft is valid", () => {
    expect(draftErrors(valid)).toEqual({
      referenceName: false,
      limit: false,
      statusLabels: false,
    })
  })

  test.each([
    ["referenceName", { referenceName: "Bad Name" }],
    ["limit", { limit: { enabled: true, value: "0" } }],
    ["limit", { limit: { enabled: true, value: "101" } }],
    ["limit", { limit: { enabled: true, value: "1.5" } }],
    ["limit", { limit: { enabled: true, value: "" } }],
    ["statusLabels", { statusLabels: { ...valid.statusLabels, lost: "  " } }],
  ] as const)("flags an invalid %s", (key, patch) => {
    expect(draftErrors({ ...valid, ...patch })[key]).toBe(true)
  })
})

describe("buildPermissionChanges", () => {
  const view = { ...NO_PERMISSIONS, canView: true }
  const grants = new Map([["1", view]])

  test("unchanged rows are skipped", () => {
    expect(
      buildPermissionChanges(grants, { "1": view, "2": NO_PERMISSIONS }),
    ).toEqual([])
  })

  test("a changed grant is set, an emptied one removed", () => {
    const edit = { ...view, canEdit: true }
    expect(
      buildPermissionChanges(
        new Map([
          ["1", view],
          ["2", view],
        ]),
        {
          "1": edit,
          "2": NO_PERMISSIONS,
          "3": view,
        },
      ),
    ).toEqual([
      { kind: "set", workspaceMemberId: "1", flags: edit },
      { kind: "remove", workspaceMemberId: "2" },
      { kind: "set", workspaceMemberId: "3", flags: view },
    ])
  })
})
