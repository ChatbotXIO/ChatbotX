import { describe, expect, test } from "vitest"
import {
  applyFreeswitchKeepRule,
  type RawEslHeaders,
} from "../src/freeswitch/keep-rule"

const headers = (overrides: Record<string, string>): RawEslHeaders => ({
  "Unique-ID": "11111111-1111-1111-1111-111111111111",
  ...overrides,
})

describe("applyFreeswitchKeepRule", () => {
  test("drops an event without cbx_* vars and not a sofia/agents event", () => {
    const kept = applyFreeswitchKeepRule(
      headers({ "Event-Name": "CHANNEL_ANSWER" }),
    )
    expect(kept).toBeNull()
  })

  test("drops an event with no Unique-ID", () => {
    const kept = applyFreeswitchKeepRule({
      "Event-Name": "CHANNEL_ANSWER",
      variable_cbx_integration_id: "iw-1",
      variable_cbx_workspace_id: "ws-1",
    })
    expect(kept).toBeNull()
  })

  test("keeps CUSTOM cbx::call carrying cbx_* vars", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "cbx::call",
        variable_cbx_integration_id: "iw-1",
        variable_cbx_workspace_id: "ws-1",
        variable_sip_from_user: "84900000000",
        variable_sip_to_user: "84911111111",
        "variable_sip_h_x-wa-meta-wacid": "wacid.abc",
      }),
    )
    expect(kept).toEqual({
      event: "CUSTOM:cbx::call",
      workspaceId: "ws-1",
      integrationId: "iw-1",
      uuid: "11111111-1111-1111-1111-111111111111",
      vars: {
        sipFromUser: "84900000000",
        sipToUser: "84911111111",
        sipHeaders: { "x-wa-meta-wacid": "wacid.abc" },
        hangupCause: undefined,
        sipTermStatus: undefined,
        otherLegUuid: undefined,
        rootUuid: undefined,
        attemptId: undefined,
        recordFilePath: undefined,
      },
    })
  })

  test("keeps CHANNEL_ANSWER carrying the exported cbx_root_uuid on the agent leg", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CHANNEL_ANSWER",
        variable_cbx_integration_id: "iw-1",
        variable_cbx_workspace_id: "ws-1",
        variable_cbx_root_uuid: "root-uuid",
        variable_sip_to_user: "ag-1-42",
      }),
    )
    expect(kept?.event).toBe("CHANNEL_ANSWER")
    expect(kept?.vars.rootUuid).toBe("root-uuid")
  })

  test("filters sip headers to x-wa-meta-*/x-cbx-* only", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CHANNEL_HANGUP_COMPLETE",
        variable_cbx_integration_id: "iw-1",
        variable_cbx_workspace_id: "ws-1",
        "variable_sip_h_x-wa-meta-wacid": "wacid.abc",
        "variable_sip_h_x-cbx-attempt": "att-1",
        "variable_sip_h_p-something-else": "should-be-dropped",
      }),
    )
    expect(kept?.vars.sipHeaders).toEqual({
      "x-wa-meta-wacid": "wacid.abc",
      "x-cbx-attempt": "att-1",
    })
  })

  test("keeps sofia::register on the agents profile without a DB read (no cbx_* required)", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::register",
        "profile-name": "agents",
        "from-user": "ag-1-42",
      }),
    )
    expect(kept?.event).toBe("CUSTOM:sofia::register")
    expect(kept?.workspaceId).toBe("")
    expect(kept?.vars.sipFromUser).toBe("ag-1-42")
  })

  test("sofia::register full fixture (sofia_reg.c:2060-2077) — reads from-user/contact/expires", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::register",
        "profile-name": "agents",
        "from-user": "ag-1-42",
        "from-host": "fs.example.com",
        contact: "sip:ag-1-42@10.0.0.5:5061;transport=tls",
        "call-id": "abc123@10.0.0.5",
        status: "Registered(TLS-SIPS)",
        expires: "3600",
        "to-user": "ag-1-42",
        "to-host": "fs.example.com",
        "network-ip": "10.0.0.5",
        "network-port": "5061",
        username: "ag-1-42",
        realm: "fs.example.com",
        "user-agent": "SIP.js/0.20.0",
      }),
    )
    expect(kept).toMatchObject({
      event: "CUSTOM:sofia::register",
      workspaceId: "",
      integrationId: "",
      vars: {
        sipFromUser: "ag-1-42",
        sipToUser: "sip:ag-1-42@10.0.0.5:5061;transport=tls",
        sipTermStatus: "3600",
      },
    })
  })

  test("sofia::unregister uses the same from-user/from-host shape as register (sofia_reg.c:2214-2225)", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::unregister",
        "profile-name": "agents",
        username: "ag-1-42",
        "from-user": "ag-1-42",
        "from-host": "fs.example.com",
        contact: "sip:ag-1-42@10.0.0.5:5061;transport=tls",
        "call-id": "abc123@10.0.0.5",
        realm: "fs.example.com",
        "network-ip": "10.0.0.5",
        "network-port": "5061",
        "user-agent": "SIP.js/0.20.0",
        expires: "0",
      }),
    )
    expect(kept?.event).toBe("CUSTOM:sofia::unregister")
    expect(kept?.vars.sipFromUser).toBe("ag-1-42")
    expect(kept?.vars.sipTermStatus).toBe("0")
  })

  test("sofia::expire has NO from-user — the user id is `user`/`username` (sofia_reg.c:727-742)", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::expire",
        "profile-name": "agents",
        "call-id": "abc123@10.0.0.5",
        user: "ag-1-42",
        username: "ag-1-42",
        host: "fs.example.com",
        contact: "sip:ag-1-42@10.0.0.5:5061;transport=tls",
        expires: "0",
        "user-agent": "SIP.js/0.20.0",
        realm: "fs.example.com",
        "network-ip": "10.0.0.5",
        "network-port": "5061",
      }),
    )
    expect(kept?.event).toBe("CUSTOM:sofia::expire")
    // The register/unregister branch would read `from-user` (absent here,
    // per sofia_reg.c) — expire must read `user` instead.
    expect(kept?.vars.sipFromUser).toBe("ag-1-42")
  })

  test("sofia::expire falls back to undefined if `user` is absent (proves it does NOT read from-user)", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::expire",
        "profile-name": "agents",
        "from-user": "should-not-be-read",
        username: "ag-1-42",
      }),
    )
    expect(kept?.vars.sipFromUser).toBeUndefined()
  })

  test("drops sofia::register on a profile other than agents", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::register",
        "profile-name": "whatsapp",
        "from-user": "1234567890",
      }),
    )
    expect(kept).toBeNull()
  })

  test("keeps sofia::gateway_state for a wa-<id> gateway", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::gateway_state",
        Gateway: "wa-1",
        State: "DOWN",
      }),
    )
    expect(kept?.event).toBe("CUSTOM:sofia::gateway_state")
    expect(kept?.vars.sipToUser).toBe("wa-1")
    expect(kept?.vars.sipTermStatus).toBe("DOWN")
  })

  test("sofia::gateway_state full fixture (sofia_reg.c:157-169) on a failure carries Ping-Status/Phrase/Status too", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::gateway_state",
        Gateway: "wa-1",
        State: "FAILED",
        "Ping-Status": "UP",
        Phrase: "Registration failed",
        Status: "403",
      }),
    )
    expect(kept?.vars.sipToUser).toBe("wa-1")
    expect(kept?.vars.sipTermStatus).toBe("FAILED")
  })

  test("drops sofia::gateway_state without a gateway name", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "sofia::gateway_state",
        State: "DOWN",
      }),
    )
    expect(kept).toBeNull()
  })

  test("drops an unrecognized event kind", () => {
    const kept = applyFreeswitchKeepRule(
      headers({
        "Event-Name": "CUSTOM",
        "Event-Subclass": "some::other-event",
        variable_cbx_integration_id: "iw-1",
        variable_cbx_workspace_id: "ws-1",
      }),
    )
    expect(kept).toBeNull()
  })
})
