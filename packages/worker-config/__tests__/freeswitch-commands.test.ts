import { describe, expect, test } from "vitest"
import {
  freeswitchApiCommandSchema,
  renderFreeswitchApiCommand,
} from "../src/queues/freeswitch/commands"

describe("renderFreeswitchApiCommand", () => {
  test("sofiaProfileRescan", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "sofiaProfileRescan",
        profile: "whatsapp",
      }),
    ).toBe("sofia profile whatsapp rescan")
  })

  test("sofiaGatewayStart", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "sofiaGatewayStart",
        profile: "whatsapp",
        gateway: "wa-42",
      }),
    ).toBe("sofia profile whatsapp startgw wa-42")
  })

  test("sofiaGatewayKill", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "sofiaGatewayKill",
        profile: "whatsapp",
        gateway: "wa-42",
      }),
    ).toBe("sofia profile whatsapp killgw wa-42")
  })

  test("sofiaGatewayStatus", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "sofiaGatewayStatus",
        gateway: "wa-42",
      }),
    ).toBe("sofia status gateway wa-42")
  })

  test("uuidKill without cause", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "uuidKill",
        uuid: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("uuid_kill 11111111-1111-1111-1111-111111111111")
  })

  test("uuidKill with cause", () => {
    expect(
      renderFreeswitchApiCommand({
        kind: "uuidKill",
        uuid: "11111111-1111-1111-1111-111111111111",
        cause: "NORMAL_CLEARING",
      }),
    ).toBe("uuid_kill 11111111-1111-1111-1111-111111111111 NORMAL_CLEARING")
  })
})

describe("freeswitchApiCommandSchema validation", () => {
  test("rejects a profile with disallowed characters", () => {
    expect(() =>
      freeswitchApiCommandSchema.parse({
        kind: "sofiaProfileRescan",
        profile: "whats app; rm -rf",
      }),
    ).toThrow()
  })

  test("rejects a gateway name outside the wa-<id> shape", () => {
    expect(() =>
      freeswitchApiCommandSchema.parse({
        kind: "sofiaGatewayStatus",
        gateway: "not-a-gateway",
      }),
    ).toThrow()
  })

  test("rejects a non-uuid channel id for uuidKill", () => {
    expect(() =>
      freeswitchApiCommandSchema.parse({
        kind: "uuidKill",
        uuid: "system; rm -rf /",
      }),
    ).toThrow()
  })

  test("rejects an unknown kind", () => {
    expect(() =>
      freeswitchApiCommandSchema.parse({ kind: "shellExec", cmd: "ls" }),
    ).toThrow()
  })
})
