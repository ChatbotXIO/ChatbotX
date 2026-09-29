import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import { describe, expect, test } from "vitest"
import type { BroadcastResourceWithRelations } from "../../schema/resource"
import {
  findPageTemplateDetail,
  resolveBroadcastPageFlows,
  resolveBroadcastPageNames,
  resolveBroadcastTemplatePages,
} from "../broadcast-detail-pages"

const broadcastWith = (fields: object) =>
  ({
    id: "b-1",
    flowId: null,
    templateId: null,
    flow: null,
    integrationMessenger: null,
    integrationWhatsapp: null,
    targets: [],
    ...fields,
  }) as unknown as BroadcastResourceWithRelations

const target = (inboxId: string, pageName: string, fields: object = {}) => ({
  inboxId,
  flowId: null,
  templateId: null,
  templateData: null,
  inbox: { id: inboxId, name: pageName },
  flow: null,
  ...fields,
})

const detail = (id: string, inboxId: string) =>
  ({ id, inboxId, channel: "messenger" }) as BroadcastTemplateDetail

describe("resolveBroadcastPageNames", () => {
  test("lists every target page", () => {
    expect(
      resolveBroadcastPageNames(
        broadcastWith({
          targets: [target("a", "Page A"), target("b", "Page B")],
        }),
      ),
    ).toBe("Page A, Page B")
  })

  test("falls back to the legacy page, else a dash", () => {
    expect(
      resolveBroadcastPageNames(
        broadcastWith({ integrationMessenger: { name: "Legacy page" } }),
      ),
    ).toBe("Legacy page")
    expect(resolveBroadcastPageNames(broadcastWith({}))).toBe("-")
  })
})

describe("resolveBroadcastPageFlows", () => {
  test("one row per target page with a flow", () => {
    expect(
      resolveBroadcastPageFlows(
        broadcastWith({
          targets: [
            target("a", "Page A", {
              flowId: "f-1",
              flow: { id: "f-1", name: "Welcome" },
            }),
            target("b", "Page B"),
          ],
        }),
      ),
    ).toEqual([
      { pageId: "a", pageName: "Page A", flowId: "f-1", flowName: "Welcome" },
    ])
  })

  test("the legacy flow, keeping its id as name when the flow row is gone", () => {
    expect(
      resolveBroadcastPageFlows(
        broadcastWith({
          flowId: "f-gone",
          integrationWhatsapp: { name: "WA number" },
        }),
      ),
    ).toEqual([
      {
        pageId: "b-1",
        pageName: "WA number",
        flowId: "f-gone",
        flowName: "f-gone",
      },
    ])
  })

  test("no flow at all → empty", () => {
    expect(resolveBroadcastPageFlows(broadcastWith({}))).toEqual([])
  })
})

describe("resolveBroadcastTemplatePages", () => {
  test("one row per target page with a template, even a deleted one", () => {
    expect(
      resolveBroadcastTemplatePages(
        broadcastWith({
          targets: [
            target("a", "Page A", { templateId: "t-a" }),
            target("b", "Page B", { templateId: "t-deleted" }),
            target("c", "Page C"),
          ],
        }),
      ),
    ).toEqual([
      { pageId: "a", pageName: "Page A", templateId: "t-a" },
      { pageId: "b", pageName: "Page B", templateId: "t-deleted" },
    ])
  })

  test("the legacy template, not pinned to a page", () => {
    expect(
      resolveBroadcastTemplatePages(
        broadcastWith({
          templateId: "t-legacy",
          integrationWhatsapp: { name: "WA number" },
        }),
      ),
    ).toEqual([{ pageName: "WA number", templateId: "t-legacy" }])
  })
})

describe("findPageTemplateDetail", () => {
  const details = [detail("t-a", "a"), detail("t-shared", "b")]

  test("matches the template of that page", () => {
    expect(
      findPageTemplateDetail(
        { pageId: "a", pageName: "Page A", templateId: "t-a" },
        details,
      ),
    ).toBe(details[0])
  })

  test("never matches another page's template with the same id", () => {
    expect(
      findPageTemplateDetail(
        { pageId: "a", pageName: "Page A", templateId: "t-shared" },
        details,
      ),
    ).toBeUndefined()
  })

  test("a deleted template → undefined", () => {
    expect(
      findPageTemplateDetail(
        { pageId: "a", pageName: "Page A", templateId: "t-deleted" },
        details,
      ),
    ).toBeUndefined()
  })

  test("a legacy row matches by id alone", () => {
    expect(
      findPageTemplateDetail(
        { pageName: "Legacy", templateId: "t-shared" },
        details,
      ),
    ).toBe(details[1])
  })
})
