import { describe, expect, test } from "vitest"
import { resolveTemplateHydration } from "../template-hydration"

const whatsapp = "whatsappTemplateMessage" as const
const messenger = "messengerTemplateMessage" as const

describe("resolveTemplateHydration", () => {
  test("skips an effect that does not own the form's subaction", () => {
    // A Messenger draft whose workspace also has approved WhatsApp templates:
    // the WhatsApp effect must not touch the Messenger draft's templateData.
    expect(
      resolveTemplateHydration({
        effectSubaction: whatsapp,
        subaction: messenger,
        watchedTemplateId: "tpl-3",
        hydratedTemplateId: "tpl-3",
      }),
    ).toBe("skip")
  })

  test("preserves the hydrated params for the effect that owns the subaction", () => {
    expect(
      resolveTemplateHydration({
        effectSubaction: messenger,
        subaction: messenger,
        watchedTemplateId: "tpl-3",
        hydratedTemplateId: "tpl-3",
      }),
    ).toBe("preserve")
  })

  test("preserves a WhatsApp draft on its own effect and skips the Messenger one", () => {
    const input = {
      subaction: whatsapp,
      watchedTemplateId: "tpl-9",
      hydratedTemplateId: "tpl-9",
    }
    expect(
      resolveTemplateHydration({ ...input, effectSubaction: whatsapp }),
    ).toBe("preserve")
    expect(
      resolveTemplateHydration({ ...input, effectSubaction: messenger }),
    ).toBe("skip")
  })

  test("skips when the form no longer holds a template — the template-to-flow switch", () => {
    expect(
      resolveTemplateHydration({
        effectSubaction: messenger,
        subaction: messenger,
        watchedTemplateId: undefined,
        hydratedTemplateId: "tpl-3",
      }),
    ).toBe("skip")
  })

  test("seeds normally once the user picks a different template mid-edit", () => {
    expect(
      resolveTemplateHydration({
        effectSubaction: messenger,
        subaction: messenger,
        watchedTemplateId: "tpl-4",
        hydratedTemplateId: "tpl-3",
      }),
    ).toBe("seed")
  })

  test("seeds in create mode, where nothing was hydrated", () => {
    expect(
      resolveTemplateHydration({
        effectSubaction: whatsapp,
        subaction: whatsapp,
        watchedTemplateId: "tpl-9",
        hydratedTemplateId: undefined,
      }),
    ).toBe("seed")
  })

  test("seeds when the draft was flow-based and a template is picked mid-edit", () => {
    expect(
      resolveTemplateHydration({
        effectSubaction: whatsapp,
        subaction: whatsapp,
        watchedTemplateId: "tpl-9",
        hydratedTemplateId: null,
      }),
    ).toBe("seed")
  })
})
