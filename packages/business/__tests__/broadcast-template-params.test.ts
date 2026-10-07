// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWa: vi.fn(),
  findMessenger: vi.fn(),
}))

vi.mock("../src/whatsapp-message-template/service", () => ({
  whatsappMessageTemplateService: { findByIdForWorkspace: mocks.findWa },
}))
vi.mock("../src/messenger-message-template/service", () => ({
  messengerMessageTemplateService: {
    findByIdForWorkspace: mocks.findMessenger,
  },
}))

const { resolveBroadcastTemplateParams } = await import(
  "../src/broadcast/template-params"
)

const waComponents = [
  { type: "HEADER", format: "IMAGE" },
  { type: "BODY", text: "Hi {{1}}" },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveBroadcastTemplateParams", () => {
  test("builds WhatsApp params for a template of the workspace", async () => {
    mocks.findWa.mockResolvedValue({ components: waComponents })

    const params = await resolveBroadcastTemplateParams({
      workspaceId: "ws-1",
      channel: "whatsapp",
      templateId: "t-1",
      values: { header: "https://cdn.x.io/a.jpg", "body.1": "Ann" },
      field: "templateParams",
    })

    expect(mocks.findWa).toHaveBeenCalledWith({
      id: "t-1",
      workspaceId: "ws-1",
    })
    expect(params).toEqual({
      header: [{ type: "image", image: { link: "https://cdn.x.io/a.jpg" } }],
      body: [{ type: "text", text: "Ann" }],
    })
  })

  test("a template outside the workspace is a 404", async () => {
    mocks.findWa.mockResolvedValue(undefined)

    await expect(
      resolveBroadcastTemplateParams({
        workspaceId: "ws-1",
        channel: "whatsapp",
        templateId: "t-x",
        values: {},
        field: "templateParams",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("missing and unknown keys are one 422 that names them", async () => {
    mocks.findWa.mockResolvedValue({ components: waComponents })

    await expect(
      resolveBroadcastTemplateParams({
        workspaceId: "ws-1",
        channel: "whatsapp",
        templateId: "t-1",
        values: { "body.1": "Ann", "body.9": "x" },
        field: "targets.0.templateParams",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "targets.0.templateParams",
      message:
        "Template parameters do not match the template (missing: header; unknown: body.9)",
    })
  })

  test("a multi-product button asks for templateData", async () => {
    mocks.findWa.mockResolvedValue({
      components: [
        { type: "BUTTONS", buttons: [{ type: "MPM", text: "View" }] },
      ],
    })

    await expect(
      resolveBroadcastTemplateParams({
        workspaceId: "ws-1",
        channel: "whatsapp",
        templateId: "t-1",
        values: {},
        field: "templateParams",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("send templateData for: button.0"),
    })
  })

  test("builds Messenger params with the template's parameter format", async () => {
    mocks.findMessenger.mockResolvedValue({
      components: [{ type: "BODY", text: "Code {{code}}" }],
      parameterFormat: "NAMED",
    })

    const params = await resolveBroadcastTemplateParams({
      workspaceId: "ws-1",
      channel: "messenger",
      templateId: "m-1",
      values: { "body.code": "1234" },
      field: "templateParams",
    })

    expect(params).toEqual({ body: [{ text: "1234", parameter_name: "code" }] })
  })

  test("other channels have no templates", async () => {
    await expect(
      resolveBroadcastTemplateParams({
        workspaceId: "ws-1",
        channel: "telegram",
        templateId: "t-1",
        values: {},
        field: "templateParams",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "channel" })
  })
})
