import { describe, expect, it } from "vitest"
import { Integration, type IntegrationDefinition } from "../src"

const definition = {
  name: "stub",
  channels: {
    channel: {
      conversation: {
        updateThreadControl: () => Promise.resolve(),
        notAFunction: "nope",
      },
    },
  },
  actions: {},
  handleRequest: () => Promise.resolve("ok"),
  disconnect: () => Promise.resolve(),
} as unknown as IntegrationDefinition<never, never, never>

describe("Integration.hasChannelHandler", () => {
  const integration = new Integration(definition)

  it("is true for a registered handler function", () => {
    expect(
      integration.hasChannelHandler(
        "conversation" as never,
        "updateThreadControl" as never,
      ),
    ).toBe(true)
  })

  it("is false for a missing handler, a missing group, or a non-function", () => {
    expect(
      integration.hasChannelHandler(
        "conversation" as never,
        "sendTyping" as never,
      ),
    ).toBe(false)
    expect(
      integration.hasChannelHandler("comment" as never, "sendComment" as never),
    ).toBe(false)
    expect(
      integration.hasChannelHandler(
        "conversation" as never,
        "notAFunction" as never,
      ),
    ).toBe(false)
  })

  it("is false for an integration without channels", () => {
    const bare = new Integration({
      ...definition,
      channels: undefined,
    } as never)
    expect(
      bare.hasChannelHandler(
        "conversation" as never,
        "updateThreadControl" as never,
      ),
    ).toBe(false)
  })

  it("runChannelHandler throws for the same missing handler", async () => {
    await expect(
      integration.runChannelHandler(
        "conversation" as never,
        "sendTyping" as never,
        {} as never,
      ),
    ).rejects.toThrow("not registered")
  })
})

describe("Integration.deliveryReceipts", () => {
  it("is false unless the integration declares delivery receipts", () => {
    expect(new Integration(definition).deliveryReceipts).toBe(false)
  })

  it("is true only for an explicit declaration", () => {
    const declared = new Integration({
      ...definition,
      deliveryReceipts: true,
    } as unknown as IntegrationDefinition<never, never, never>)
    const notDeclared = new Integration({
      ...definition,
      deliveryReceipts: undefined,
    } as unknown as IntegrationDefinition<never, never, never>)

    expect(declared.deliveryReceipts).toBe(true)
    expect(notDeclared.deliveryReceipts).toBe(false)
  })
})
