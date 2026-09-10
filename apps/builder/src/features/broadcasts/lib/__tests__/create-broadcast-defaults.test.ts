import { describe, expect, test } from "vitest"
import {
  buildCreateBroadcastDefaultValues,
  buildEditBroadcastDefaultValues,
} from "../create-broadcast-defaults"

describe("buildCreateBroadcastDefaultValues", () => {
  test("returns an empty channel/filter when nothing is prefilled", () => {
    expect(buildCreateBroadcastDefaultValues({})).toEqual({
      channel: undefined,
      flowId: undefined,
      subaction: undefined,
      inboxIds: [],
      targets: [],
      schedulesType: "now",
      schedulesAt: null,
      contactFilter: { operator: "and", conditions: [] },
    })
  })

  test("seeds channel, subaction, integration, and contactFilter for a WhatsApp deep-link", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "ctwaRetarget" as const,
          segment: "purchases" as const,
          adId: "238512000000102",
          since: "2026-07-01",
          until: "2026-07-31",
        },
      ],
    }

    const result = buildCreateBroadcastDefaultValues({
      initialChannel: "whatsapp",
      initialInboxIds: ["inbox-12345"],
      initialContactFilter: contactFilter,
    })

    expect(result.channel).toBe("whatsapp")
    expect(result.subaction).toBe("whatsappTemplateMessage")
    expect(result.inboxIds).toEqual(["inbox-12345"])
    expect(result.targets).toEqual([{ inboxId: "inbox-12345" }])
    expect(result.contactFilter).toEqual(contactFilter)
  })

  test("does not default to a template subaction for a non-WhatsApp channel", () => {
    const result = buildCreateBroadcastDefaultValues({
      initialChannel: "messenger",
    })

    expect(result.channel).toBe("messenger")
    expect(result.subaction).toBeUndefined()
  })
})

const baseDraft = {
  id: "b-1",
  channel: "whatsapp",
  subaction: "whatsappTemplateMessage",
  flowId: null,
  templateId: null,
  integrationWhatsappId: null,
  integrationMessengerId: null,
  templateData: null,
  schedulesType: "now",
  schedulesAt: new Date("2026-08-30T10:15:00.000Z"),
  contactFilter: null,
  targets: [],
  integrationWhatsapp: null,
  integrationMessenger: null,
}

describe("buildEditBroadcastDefaultValues", () => {
  test("round-trips a flow-based draft scheduled for a future time", () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "ctwaRetarget" as const,
          segment: "purchases" as const,
          adId: "238512000000102",
          since: "2026-07-01",
          until: "2026-07-31",
        },
      ],
    }

    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      channel: "omnichannel",
      subaction: "allContacts",
      flowId: "flow-9",
      schedulesType: "future",
      schedulesAt: new Date("2030-01-01T09:30:00.000Z"),
      contactFilter,
    })

    expect(built).not.toBeNull()
    expect(built?.id).toBe("b-1")
    expect(built?.channel).toBe("omnichannel")
    expect(built?.defaultValues).toMatchObject({
      channel: "omnichannel",
      subaction: "allContacts",
      templateType: "flow",
      flowId: "flow-9",
      templateId: undefined,
      templateData: undefined,
      buttons: [],
      schedulesType: "future",
      schedulesAt: "2030-01-01T09:30:00.000Z",
      saveAsDraft: false,
    })
    expect(built?.defaultValues.contactFilter).toEqual(contactFilter)
  })

  test("drops the stored time for a now-schedule and defaults an absent filter", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      flowId: "flow-9",
    })

    expect(built?.defaultValues.schedulesType).toBe("now")
    expect(built?.defaultValues.schedulesAt).toBeNull()
    expect(built?.defaultValues.contactFilter).toEqual({
      operator: "and",
      conditions: [],
    })
  })

  test("keeps the legacy single-template fields when the draft's page is gone", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      templateId: "tpl-3",
      integrationMessengerId: "im-7",
      templateData: {
        body: [{ text: "Ann" }],
        buttons: [{ id: "btn-1", label: "Shop", flowId: "flow-4" }],
      },
    })

    expect(built?.defaultValues.templateType).toBe("template")
    expect(built?.defaultValues.templateId).toBe("tpl-3")
    expect(built?.defaultValues.integrationMessengerId).toBe("im-7")
    expect(built?.defaultValues.buttons).toEqual([
      { id: "btn-1", label: "Shop", flowId: "flow-4" },
    ])
    expect(built?.defaultValues.templateData).toEqual({
      body: [{ text: "Ann" }],
    })
    expect(built?.defaultValues.inboxIds).toEqual([])
    expect(built?.defaultValues.targets).toEqual([])
  })

  test("reopens a legacy single-page template draft as one target on its integration's inbox", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      templateId: "tpl-3",
      integrationMessengerId: "im-7",
      integrationMessenger: { inboxId: "inbox-7" },
      templateData: {
        body: [{ text: "Ann" }],
        buttons: [{ id: "btn-1", label: "Shop", flowId: "flow-4" }],
      },
    })

    expect(built?.defaultValues.templateType).toBe("template")
    expect(built?.defaultValues.inboxIds).toEqual(["inbox-7"])
    expect(built?.defaultValues.targets).toEqual([
      {
        inboxId: "inbox-7",
        templateId: "tpl-3",
        templateData: { body: [{ text: "Ann" }] },
        buttons: [{ id: "btn-1", label: "Shop", flowId: "flow-4" }],
      },
    ])
    // The next save stores the template on the target, not the legacy columns.
    expect(built?.defaultValues.templateId).toBeUndefined()
    expect(built?.defaultValues.integrationMessengerId).toBeUndefined()
    expect(built?.defaultValues.templateData).toBeUndefined()
    expect(built?.defaultValues.buttons).toEqual([])
  })

  test("reopens a legacy single-page flow draft carrying its flow onto the one target", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      flowId: "flow-9",
      integrationMessengerId: "im-7",
      integrationMessenger: { inboxId: "inbox-7" },
    })

    expect(built?.defaultValues.templateType).toBe("flow")
    expect(built?.defaultValues.inboxIds).toEqual(["inbox-7"])
    // The flow lands on the target so the flow card hydrates instead of being
    // empty (which validation would then reject).
    expect(built?.defaultValues.targets).toEqual([
      {
        inboxId: "inbox-7",
        flowId: "flow-9",
        templateData: undefined,
        buttons: [],
      },
    ])
  })

  test("hydrates every page of a multi-page draft with its own template and params", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      targets: [
        {
          inboxId: "inbox-a",
          flowId: null,
          templateId: "tpl-a",
          templateData: { body: [{ text: "A" }], buttons: [] },
        },
        {
          inboxId: "inbox-b",
          flowId: null,
          templateId: "tpl-b",
          templateData: {
            body: [{ text: "B" }],
            buttons: [{ id: "btn-1", label: "Go", flowId: "flow-1" }],
          },
        },
      ],
    })

    expect(built?.defaultValues.templateType).toBe("template")
    expect(built?.defaultValues.inboxIds).toEqual(["inbox-a", "inbox-b"])
    expect(built?.defaultValues.targets).toEqual([
      {
        inboxId: "inbox-a",
        templateId: "tpl-a",
        templateData: { body: [{ text: "A" }] },
        buttons: [],
      },
      {
        inboxId: "inbox-b",
        templateId: "tpl-b",
        templateData: { body: [{ text: "B" }] },
        buttons: [{ id: "btn-1", label: "Go", flowId: "flow-1" }],
      },
    ])
  })

  test("hydrates a multi-page flow draft with each page's own flow", () => {
    const built = buildEditBroadcastDefaultValues({
      ...baseDraft,
      targets: [
        {
          inboxId: "inbox-a",
          flowId: "flow-9",
          templateId: null,
          templateData: null,
        },
      ],
    })

    expect(built?.defaultValues.templateType).toBe("flow")
    expect(built?.defaultValues.flowId).toBeUndefined()
    expect(built?.defaultValues.targets).toEqual([
      {
        inboxId: "inbox-a",
        flowId: "flow-9",
        templateId: undefined,
        templateData: undefined,
        buttons: [],
      },
    ])
  })

  test("returns null for a channel or subaction the app no longer knows", () => {
    expect(
      buildEditBroadcastDefaultValues({
        ...baseDraft,
        channel: "carrier-pigeon",
      }),
    ).toBeNull()
    expect(
      buildEditBroadcastDefaultValues({ ...baseDraft, subaction: "shoutIt" }),
    ).toBeNull()
  })
})
