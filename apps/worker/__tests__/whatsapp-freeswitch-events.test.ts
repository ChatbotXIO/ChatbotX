import { beforeEach, describe, expect, test, vi } from "vitest"

const AGENT_SIP_USERNAME_RE = /^ag-(\d+)-(\d+)$/

const mocks = vi.hoisted(() => ({
  ensureCallRow: vi.fn(),
  broadcastToWorkspaceParty: vi.fn(),
  agentPresenceApply: vi.fn(),
  parseAgentSipUsername: vi.fn((username: string) => {
    const match = AGENT_SIP_USERNAME_RE.exec(username)
    if (!match) {
      throw new Error("invalid-agent-sip-username")
    }
    return { workspaceId: match[1], userId: match[2] }
  }),
  findByFreeswitchUuid: vi.fn(),
  finalizeById: vi.fn(),
  recordBLegOutcome: vi.fn(),
  attachWacid: vi.fn(),
  findByGatewayName: vi.fn(),
  updateSipProvisioning: vi.fn(),
  freeswitchRecordingsAdd: vi.fn(),
  finalizeCallSideEffects: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  isBlockedWorkspace: vi.fn(async () => false),
}))

vi.mock("@chatbotx.io/business", () => ({
  ensureCallRow: mocks.ensureCallRow,
  broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  agentPresenceService: { applyRegistrationEvent: mocks.agentPresenceApply },
  parseAgentSipUsername: mocks.parseAgentSipUsername,
  resolveTerminalStatus: (input: { cause: string; priorStatus: string }) => {
    if (input.cause === "NORMAL_CLEARING") {
      return input.priorStatus === "accepted" ? "completed" : "failed"
    }
    if (input.cause === "CALL_REJECTED" || input.cause === "USER_BUSY") {
      return "rejected"
    }
    return "failed"
  },
  SIP_TERM_STATUS_TO_ERROR: {
    "486": "whatsapp.calls.errors.sipBusy",
    "407": "whatsapp.calls.errors.sipAuthFailed",
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByFreeswitchUuid: mocks.findByFreeswitchUuid,
    finalizeById: mocks.finalizeById,
    recordBLegOutcome: mocks.recordBLegOutcome,
    attachWacid: mocks.attachWacid,
  },
  integrationWhatsappRepository: {
    findByGatewayName: mocks.findByGatewayName,
    updateSipProvisioning: mocks.updateSipProvisioning,
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  setWebhookExecutionContext: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  RealtimeEventType: {
    whatsappCallRinging: "whatsappCallRinging",
    whatsappCallEnded: "whatsappCallEnded",
  },
  getFreeswitchRecordingsQueue: () => ({ add: mocks.freeswitchRecordingsAdd }),
}))

vi.mock("@chatbotx.io/partysocket-config", () => ({
  RealtimeEventType: {
    whatsappCallRinging: "whatsappCallRinging",
    whatsappCallEnded: "whatsappCallEnded",
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mocks.logger }))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: mocks.isBlockedWorkspace,
}))

vi.mock(
  "../src/integration/handlers/shared/whatsapp-call-participants",
  () => ({
    resolveFreeswitchCallParticipants: vi.fn(),
  }),
)

// The message/tracking/broadcast/trigger internals are the shared module's
// own responsibility (tested in whatsapp-call-finalize.test.ts) — this file
// only asserts that the FS handler calls it with the right `call`/`entity`.
vi.mock("../src/integration/handlers/shared/whatsapp-call-finalize", () => ({
  finalizeCallSideEffects: mocks.finalizeCallSideEffects,
}))

const { FREESWITCH_EVENT_HANDLERS, handleWhatsappFreeswitchEvent } =
  await import("../src/integration/handlers/whatsapp-freeswitch")

const baseData = {
  nodeId: "default",
  workspaceId: "ws-1",
  integrationId: "iw-1",
  uuid: "11111111-1111-1111-1111-111111111111",
  vars: { sipHeaders: {} },
} as const

const call = (overrides: Record<string, unknown> = {}) => ({
  id: "call-1",
  workspaceId: "ws-1",
  status: "ringing",
  direction: "userInitiated",
  wacid: null,
  attemptId: "att-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  ...overrides,
})

describe("FREESWITCH_EVENT_HANDLERS dispatch table", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.parseAgentSipUsername.mockImplementation((username: string) => {
      const match = AGENT_SIP_USERNAME_RE.exec(username)
      if (!match) {
        throw new Error("invalid-agent-sip-username")
      }
      return { workspaceId: match[1], userId: match[2] }
    })
    mocks.isBlockedWorkspace.mockResolvedValue(false)
  })

  test("has an entry for every FreeswitchEventKind", () => {
    const kinds = [
      "CHANNEL_ANSWER",
      "CHANNEL_HANGUP_COMPLETE",
      "RECORD_STOP",
      "CUSTOM:cbx::call",
      "CUSTOM:sofia::register",
      "CUSTOM:sofia::unregister",
      "CUSTOM:sofia::expire",
      "CUSTOM:sofia::gateway_state",
    ] as const
    for (const kind of kinds) {
      expect(FREESWITCH_EVENT_HANDLERS[kind]).toBeTypeOf("function")
    }
  })

  describe("CUSTOM:cbx::call", () => {
    test("creates/attaches the call row and emits ringing for a fresh inbound call", async () => {
      mocks.ensureCallRow.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:cbx::call",
        vars: {
          ...baseData.vars,
          sipFromUser: "84900000000",
          sipToUser: "849099999",
        },
      })

      expect(mocks.ensureCallRow).toHaveBeenCalledWith(
        expect.objectContaining({
          rootUuid: baseData.uuid,
          integrationId: baseData.integrationId,
        }),
      )
      expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({ eventType: "whatsappCallRinging" }),
      )
    })

    test("does not emit ringing for an outbound (businessInitiated) call", async () => {
      mocks.ensureCallRow.mockResolvedValueOnce(
        call({ direction: "businessInitiated" }),
      )

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:cbx::call",
      })

      expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    })

    test("idempotent on redelivery: calling twice never throws and calls ensureCallRow each time", async () => {
      mocks.ensureCallRow.mockResolvedValue(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:cbx::call",
      })
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:cbx::call",
      })

      expect(mocks.ensureCallRow).toHaveBeenCalledTimes(2)
    })
  })

  describe("CHANNEL_ANSWER", () => {
    const bLegUuid = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    test("a bridged agent B-leg answer advances the row to accepted with answeredByUserId parsed from sipToUser", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        uuid: bLegUuid,
        event: "CHANNEL_ANSWER",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          sipToUser: "ag-1-42",
        },
      })

      expect(mocks.findByFreeswitchUuid).toHaveBeenCalledWith(baseData.uuid)
      expect(mocks.finalizeById).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "call-1",
          status: "accepted",
          answeredByUserId: "42",
          freeswitchBLegUuid: bLegUuid,
        }),
      )
    })

    test("the root (Meta) leg's own answer never marks the call accepted — the dialplan answers it early", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_ANSWER",
        vars: { ...baseData.vars, rootUuid: baseData.uuid },
      })

      expect(mocks.finalizeById).not.toHaveBeenCalled()
    })

    test("a root-leg answer with no rootUuid var still resolves as the root leg", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_ANSWER",
        vars: { ...baseData.vars, rootUuid: undefined },
      })

      expect(mocks.findByFreeswitchUuid).toHaveBeenCalledWith(baseData.uuid)
      expect(mocks.finalizeById).not.toHaveBeenCalled()
    })

    test("root-leg answer that wins the race over cbx::call creates the row but does NOT advance it", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(undefined)
      mocks.ensureCallRow.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_ANSWER",
        vars: { ...baseData.vars, rootUuid: baseData.uuid },
      })

      expect(mocks.ensureCallRow).toHaveBeenCalledWith(
        expect.objectContaining({ rootUuid: baseData.uuid }),
      )
      expect(mocks.finalizeById).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalled()
    })

    test("a bridged agent B-leg answer with no row yet is retried (throws), never acknowledged", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(undefined)

      await expect(
        handleWhatsappFreeswitchEvent({
          ...baseData,
          uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          event: "CHANNEL_ANSWER",
          vars: { ...baseData.vars, rootUuid: baseData.uuid },
        }),
      ).rejects.toThrow("freeswitch-call-row-not-ready")
      expect(mocks.ensureCallRow).not.toHaveBeenCalled()
      expect(mocks.finalizeById).not.toHaveBeenCalled()
    })
  })

  describe("CHANNEL_HANGUP_COMPLETE", () => {
    test("A-leg NORMAL_CLEARING after accepted -> completed, emits ended, delegates to finalizeCallSideEffects", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(
        call({ status: "accepted" }),
      )

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NORMAL_CLEARING",
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          call: expect.objectContaining({ id: "call-1", status: "accepted" }),
          entity: expect.objectContaining({ status: "completed" }),
        }),
      )
      expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({ eventType: "whatsappCallEnded" }),
      )
    })

    test("A-leg NORMAL_CLEARING while still ringing -> failed (missed), not completed", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(
        call({ status: "ringing" }),
      )

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NORMAL_CLEARING",
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: expect.objectContaining({ status: "failed" }),
        }),
      )
    })

    test("fills a null wacid from the BYE header before finalizing", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(call({ wacid: null }))
      mocks.attachWacid.mockResolvedValueOnce(
        call({ wacid: "wacid.xyz", status: "accepted" }),
      )

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NORMAL_CLEARING",
          sipHeaders: { "x-wa-meta-wacid": "wacid.xyz" },
        },
      })

      expect(mocks.attachWacid).toHaveBeenCalledWith({
        id: "call-1",
        wacid: "wacid.xyz",
      })
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          call: expect.objectContaining({ wacid: "wacid.xyz" }),
        }),
      )
    })

    test("idempotent on redelivery: calling twice never throws", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValue(call({ status: "accepted" }))

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NORMAL_CLEARING",
        },
      })
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NORMAL_CLEARING",
        },
      })

      expect(mocks.finalizeCallSideEffects).toHaveBeenCalledTimes(2)
    })

    test("B-leg hangup (outbound Meta leg failure) records lastError on the row but never terminates the call", async () => {
      const rootUuid = "22222222-2222-2222-2222-222222222222"
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        uuid: baseData.uuid, // B-leg uuid differs from rootUuid
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: { ...baseData.vars, rootUuid, sipTermStatus: "486" },
      })

      // Only the root A-leg may terminate the call: a B-leg
      // outcome is recorded without touching the status.
      expect(mocks.recordBLegOutcome).toHaveBeenCalledWith({
        id: call().id,
        freeswitchBLegUuid: baseData.uuid,
        lastError: "whatsapp.calls.errors.sipBusy",
      })
      expect(mocks.finalizeById).not.toHaveBeenCalled()
      expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
    })

    test("root-leg hangup with no row yet creates it via ensureCallRow and still finalizes", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(undefined)
      mocks.ensureCallRow.mockResolvedValueOnce(call())

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CHANNEL_HANGUP_COMPLETE",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          hangupCause: "NO_ANSWER",
        },
      })

      expect(mocks.ensureCallRow).toHaveBeenCalledWith(
        expect.objectContaining({ rootUuid: baseData.uuid }),
      )
      expect(mocks.finalizeCallSideEffects).toHaveBeenCalled()
    })

    test("a B-leg hangup with no row yet is retried (throws)", async () => {
      mocks.findByFreeswitchUuid.mockResolvedValueOnce(undefined)

      await expect(
        handleWhatsappFreeswitchEvent({
          ...baseData,
          uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          event: "CHANNEL_HANGUP_COMPLETE",
          vars: { ...baseData.vars, rootUuid: baseData.uuid },
        }),
      ).rejects.toThrow("freeswitch-call-row-not-ready")
      expect(mocks.recordBLegOutcome).not.toHaveBeenCalled()
    })
  })

  describe("RECORD_STOP", () => {
    test("enqueues the upload job with the deterministic jobId", async () => {
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "RECORD_STOP",
        vars: {
          ...baseData.vars,
          rootUuid: baseData.uuid,
          recordFilePath: "/recordings/wa/ws-1/uuid.ogg",
        },
      })

      expect(mocks.freeswitchRecordingsAdd).toHaveBeenCalledWith(
        "callRecordingUpload",
        expect.objectContaining({
          data: expect.objectContaining({
            path: "/recordings/wa/ws-1/uuid.ogg",
          }),
        }),
        { jobId: `rec-upload-${baseData.uuid}` },
      )
    })

    test("no-op when the file path is missing", async () => {
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "RECORD_STOP",
        vars: { ...baseData.vars, rootUuid: baseData.uuid },
      })

      expect(mocks.freeswitchRecordingsAdd).not.toHaveBeenCalled()
    })
  })

  describe("sofia::register|unregister|expire", () => {
    test("register applies the presence upsert", async () => {
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::register",
        vars: {
          ...baseData.vars,
          sipFromUser: "ag-1-42",
          sipToUser: "sip:contact",
        },
      })

      expect(mocks.agentPresenceApply).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "register", username: "ag-1-42" }),
      )
    })

    test("an invalid username is logged, not thrown", async () => {
      // The handler now resolves `workspaceId` from the username itself
      // (for the blocked-owner guard) before calling
      // `agentPresenceService.applyRegistrationEvent` — a username outside
      // the `ag-<ws>-<u>` shape throws from `parseAgentSipUsername` here,
      // so the presence upsert is never reached.
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::expire",
        vars: { ...baseData.vars, sipFromUser: "not-an-agent" },
      })

      expect(mocks.agentPresenceApply).not.toHaveBeenCalled()
      expect(mocks.logger.warn).toHaveBeenCalled()
    })

    test("no-op when no username is present", async () => {
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::unregister",
      })
      expect(mocks.agentPresenceApply).not.toHaveBeenCalled()
    })

    test("a blocked workspace (resolved from the SIP username) skips the presence upsert", async () => {
      mocks.isBlockedWorkspace.mockResolvedValueOnce(true)

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::register",
        vars: {
          ...baseData.vars,
          sipFromUser: "ag-1-42",
          sipToUser: "sip:contact",
        },
      })

      expect(mocks.isBlockedWorkspace).toHaveBeenCalledWith("1")
      expect(mocks.agentPresenceApply).not.toHaveBeenCalled()
    })
  })

  describe("sofia::gateway_state", () => {
    test("DOWN state records sipLastError on the owning integration", async () => {
      mocks.findByGatewayName.mockResolvedValueOnce({
        id: "iw-1",
        workspaceId: "ws-1",
        sipProvisioningClaim: "claim-1",
      })

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::gateway_state",
        vars: { ...baseData.vars, sipToUser: "wa-1", sipTermStatus: "DOWN" },
      })

      expect(mocks.updateSipProvisioning).toHaveBeenCalledWith(
        expect.objectContaining({ id: "iw-1", claim: "claim-1" }),
      )
    })

    test("a healthy state (REGED) does not touch provisioning", async () => {
      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::gateway_state",
        vars: { ...baseData.vars, sipToUser: "wa-1", sipTermStatus: "REGED" },
      })

      expect(mocks.updateSipProvisioning).not.toHaveBeenCalled()
    })

    test("a blocked workspace skips updateSipProvisioning", async () => {
      mocks.findByGatewayName.mockResolvedValueOnce({
        id: "iw-1",
        workspaceId: "ws-1",
        sipProvisioningClaim: "claim-1",
      })
      mocks.isBlockedWorkspace.mockResolvedValueOnce(true)

      await handleWhatsappFreeswitchEvent({
        ...baseData,
        event: "CUSTOM:sofia::gateway_state",
        vars: { ...baseData.vars, sipToUser: "wa-1", sipTermStatus: "DOWN" },
      })

      expect(mocks.isBlockedWorkspace).toHaveBeenCalledWith("ws-1")
      expect(mocks.updateSipProvisioning).not.toHaveBeenCalled()
    })
  })
})
