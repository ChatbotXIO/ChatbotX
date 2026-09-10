import { describe, expect, test } from "vitest"
import {
  buildTargetTemplateOptions,
  clearTargetTemplates,
  resolveAudienceInboxIds,
  syncTargetsWithInboxIds,
} from "../broadcast-targets"

const targetA = {
  inboxId: "inbox-a",
  templateId: "tpl-a",
  templateData: { body: [{ type: "text" as const, text: "Ada" }] },
  buttons: [],
}

describe("syncTargetsWithInboxIds", () => {
  test("adds an empty target for a newly selected page", () => {
    expect(syncTargetsWithInboxIds([targetA], ["inbox-a", "inbox-b"])).toEqual([
      targetA,
      { inboxId: "inbox-b" },
    ])
  })

  test("drops the target of a deselected page and keeps the others intact", () => {
    expect(
      syncTargetsWithInboxIds([targetA, { inboxId: "inbox-b" }], ["inbox-b"]),
    ).toEqual([{ inboxId: "inbox-b" }])
  })

  test("follows the selection order", () => {
    expect(
      syncTargetsWithInboxIds(
        [targetA, { inboxId: "inbox-b" }],
        ["inbox-b", "inbox-a"],
      ),
    ).toEqual([{ inboxId: "inbox-b" }, targetA])
  })

  test("returns an empty list when no page is selected", () => {
    expect(syncTargetsWithInboxIds([targetA], [])).toEqual([])
  })
})

describe("clearTargetTemplates", () => {
  test("keeps the pages but forgets their templates and params", () => {
    expect(clearTargetTemplates([targetA, { inboxId: "inbox-b" }])).toEqual([
      { inboxId: "inbox-a" },
      { inboxId: "inbox-b" },
    ])
  })
})

describe("buildTargetTemplateOptions", () => {
  const templates = [
    { id: "tpl-a", name: "promo", language: "vi", inboxId: "inbox-a" },
    { id: "tpl-b", name: "promo", language: "en", inboxId: "inbox-b" },
    { id: "tpl-c", name: "welcome", language: "vi", inboxId: "inbox-a" },
  ]

  test("lists only the page's own templates, labelled with the page name", () => {
    expect(
      buildTargetTemplateOptions(templates, {
        inboxId: "inbox-a",
        inboxName: "Shop ABC",
      }),
    ).toEqual([
      { label: "Shop ABC - promo (vi)", value: "tpl-a" },
      { label: "Shop ABC - welcome (vi)", value: "tpl-c" },
    ])
  })

  test("is empty for a page without approved templates", () => {
    expect(
      buildTargetTemplateOptions(templates, {
        inboxId: "inbox-z",
        inboxName: "Nowhere",
      }),
    ).toEqual([])
  })
})

describe("resolveAudienceInboxIds", () => {
  const templateTarget = { inboxId: "inbox-a", templateId: "tpl-a" }
  const emptyTarget = { inboxId: "inbox-b" }
  const flowTarget = { inboxId: "inbox-c", flowId: "flow-c" }

  test("returns undefined for a non-template subaction (legacy resolution applies)", () => {
    expect(
      resolveAudienceInboxIds({
        isTemplateSubaction: false,
        sendsTemplate: false,
        inboxIds: ["inbox-a", "inbox-b"],
        targets: [templateTarget, emptyTarget],
      }),
    ).toBeUndefined()
  })

  test("template send counts only pages that carry a template", () => {
    expect(
      resolveAudienceInboxIds({
        isTemplateSubaction: true,
        sendsTemplate: true,
        inboxIds: ["inbox-a", "inbox-b"],
        targets: [templateTarget, emptyTarget],
      }),
    ).toEqual(["inbox-a"])
  })

  test("template send with no configured template scopes the audience to nobody", () => {
    expect(
      resolveAudienceInboxIds({
        isTemplateSubaction: true,
        sendsTemplate: true,
        inboxIds: ["inbox-b"],
        targets: [emptyTarget],
      }),
    ).toEqual([])
  })

  test("flow send counts only pages that carry a flow", () => {
    expect(
      resolveAudienceInboxIds({
        isTemplateSubaction: true,
        sendsTemplate: false,
        inboxIds: ["inbox-b", "inbox-c"],
        targets: [emptyTarget, flowTarget],
      }),
    ).toEqual(["inbox-c"])
  })
})
