import { channelTypes } from "@chatbotx.io/database/partials"
import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, it } from "vitest"
import type { MenuData, MenuItem, TranslationFn } from "../../types"
import { sendMessageEditorMenus } from "../menu"
import { integrationMenus } from "../menus/integration-menu"

// next-intl's translation fn — pass the key straight through so menu labels
// equal their i18n key (e.g. "flows.actions.sendTemplateMessage").
const t = ((key: string) => key) as unknown as TranslationFn

const TEMPLATE_LABEL = "flows.actions.sendTemplateMessage"
const NO_TEMPLATES_LABEL = "flows.actions.noTemplatesAvailable"

const waInbox = {
  id: "wa-1",
  name: "WA Inbox",
  channel: channelTypes.enum.whatsapp,
}
const messengerInbox = {
  id: "msgr-1",
  name: "Messenger Inbox",
  channel: channelTypes.enum.messenger,
}
// A channel without template support — must be excluded from the menu.
const telegramInbox = {
  id: "tg-1",
  name: "TG Inbox",
  channel: channelTypes.enum.telegram,
}

const waTemplate = {
  id: "wa-tmpl-1",
  name: "hello_world",
  language: "en",
  integrationWhatsappId: "wa-integ-1",
  integrationWhatsapp: { inboxId: waInbox.id },
}
const messengerTemplate = {
  id: "msgr-tmpl-1",
  name: "order_confirm",
  language: "en",
  parameterFormat: "POSITIONAL",
  integrationMessengerId: "msgr-integ-1",
  integrationMessenger: { inboxId: messengerInbox.id },
}

// Only id/name/channel are read by the menu code; cast the rest away.
const buildMenuData = (
  channel: MenuData["beforeStep"]["channel"],
  inboxes = [waInbox, messengerInbox, telegramInbox],
): MenuData =>
  ({
    inboxes,
    templates: {
      waTemplates: [waTemplate],
      messengerTemplates: [messengerTemplate],
    },
    beforeStep: { id: "before-1", stepType: "chooseChannel", channel },
  }) as unknown as MenuData

const findTemplateItem = (items: MenuItem[]): MenuItem | undefined =>
  items.find((item) => item.label === TEMPLATE_LABEL)

const childLabels = (item?: MenuItem): string[] =>
  (item?.children ?? []).map((child) => child.label)

describe("sendMessageEditorMenus — template message consolidation", () => {
  it("shows exactly ONE Template Message item on omnichannel (no duplicate)", () => {
    const items = sendMessageEditorMenus(
      t,
      buildMenuData(channelTypes.enum.omnichannel),
    )

    const templateItems = items.filter((item) => item.label === TEMPLATE_LABEL)
    expect(templateItems).toHaveLength(1)

    // The old per-channel labels must be gone.
    const labels = items.map((item) => item.label)
    expect(labels).not.toContain("flows.actions.sendWaTemplateMessage")
    expect(labels).not.toContain("flows.actions.sendMessengerTemplateMessage")
  })

  it("mixes WhatsApp and Messenger inboxes under the single omnichannel item", () => {
    const items = sendMessageEditorMenus(
      t,
      buildMenuData(channelTypes.enum.omnichannel),
    )

    const labels = childLabels(findTemplateItem(items))
    expect(labels).toContain(waInbox.name)
    expect(labels).toContain(messengerInbox.name)
    // Non-template channel inbox is excluded.
    expect(labels).not.toContain(telegramInbox.name)
  })

  it("shows only WhatsApp inboxes when channel is whatsapp", () => {
    const items = sendMessageEditorMenus(
      t,
      buildMenuData(channelTypes.enum.whatsapp),
    )

    const labels = childLabels(findTemplateItem(items))
    expect(labels).toContain(waInbox.name)
    expect(labels).not.toContain(messengerInbox.name)
  })

  it("shows only the 5 allowed steps when channel is tiktok", () => {
    const items = sendMessageEditorMenus(
      t,
      buildMenuData(channelTypes.enum.tiktok),
    )

    expect(items.map((item) => item.label)).toEqual([
      "flows.actions.sendText",
      "flows.actions.sendImage",
      "flows.actions.getUserData",
      "flows.actions.typing",
      "flows.actions.actions",
    ])
  })

  it("shows only Messenger inboxes when channel is messenger", () => {
    const items = sendMessageEditorMenus(
      t,
      buildMenuData(channelTypes.enum.messenger),
    )

    const labels = childLabels(findTemplateItem(items))
    expect(labels).toContain(messengerInbox.name)
    expect(labels).not.toContain(waInbox.name)
  })
})

describe("integrationMenus", () => {
  it("returns both channels for omnichannel and drops non-template channels", () => {
    const menus = integrationMenus(
      t,
      buildMenuData(channelTypes.enum.omnichannel),
      channelTypes.enum.omnichannel,
    )

    const labels = menus.map((item) => item.label)
    expect(labels).toEqual([waInbox.name, messengerInbox.name])
  })

  it("returns only WhatsApp inboxes and carries the wa step type on leaves", () => {
    const menus = integrationMenus(
      t,
      buildMenuData(channelTypes.enum.whatsapp),
      channelTypes.enum.whatsapp,
    )

    expect(menus.map((item) => item.label)).toEqual([waInbox.name])

    const leaf = menus[0]?.children?.[0]
    expect(leaf?.stepType).toBe(stepTypes.enum.sendWaTemplateMessage)
    expect(leaf?.props?.template).toBeDefined()
  })

  it("returns a single noTemplatesAvailable leaf when there are no inboxes", () => {
    const menus = integrationMenus(
      t,
      buildMenuData(channelTypes.enum.omnichannel, []),
      channelTypes.enum.omnichannel,
    )

    expect(menus).toHaveLength(1)
    expect(menus[0]?.label).toBe(NO_TEMPLATES_LABEL)
    expect(menus[0]?.stepType).toBeNull()
  })
})
