import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimSipProvisioning: vi.fn(),
  updateSipProvisioning: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  pinWorkspaceToNode: vi.fn(),
  freeswitchRun: vi.fn(),
  encryptText: vi.fn(async (value: string) => ({
    v: 1,
    text: value,
    iv: "iv",
    tag: "tag",
  })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    claimSipProvisioning: mocks.claimSipProvisioning,
    updateSipProvisioning: mocks.updateSipProvisioning,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptText: mocks.encryptText },
}))
vi.mock("../src/whatsapp-call/sip-node-allocator", () => ({
  pinWorkspaceToNode: mocks.pinWorkspaceToNode,
}))
vi.mock("../src/whatsapp-call/freeswitch-api-client", () => ({
  freeswitchApiClient: { run: mocks.freeswitchRun },
}))

const {
  sipProvisioningService,
  SIP_PROVISIONING_TRANSITIONS,
  assertSipProvisioningTransition,
  SipProvisioningTransitionError,
  SipProvisioningClaimUnavailableError,
  SipProvisioningMissingCredentialsError,
  SipProvisioningGatewayError,
} = await import("../src/whatsapp-call/sip-provisioning-service")

// The repository's `claimSipProvisioning` always sets the row to
// "provisioning" before returning it (see repository doc comment) — the
// mock reflects that post-claim state, not the pre-claim "none"/"failed".
const baseClaimedRow = {
  id: "iw-1",
  workspaceId: "ws-1",
  sipProvisioningStatus: "provisioning",
  auth: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pinWorkspaceToNode.mockResolvedValue({ nodeId: "default" })
  mocks.freeswitchRun.mockResolvedValue({
    ok: true,
    reply: "gateway wa-iw-1 state NOREG",
  })
  mocks.updateSipProvisioning.mockImplementation(async (input) => ({
    ...baseClaimedRow,
    ...input.values,
  }))
})

describe("SIP_PROVISIONING_TRANSITIONS / assertSipProvisioningTransition", () => {
  test("rejects none -> enabled", () => {
    expect(() => assertSipProvisioningTransition("none", "enabled")).toThrow(
      SipProvisioningTransitionError,
    )
  })

  test("allows enabled -> provisioned (the disable path)", () => {
    expect(() =>
      assertSipProvisioningTransition("enabled", "provisioned"),
    ).not.toThrow()
  })

  test("allows none -> provisioning", () => {
    expect(() =>
      assertSipProvisioningTransition("none", "provisioning"),
    ).not.toThrow()
  })

  test("every declared edge is internally consistent (source key matches map)", () => {
    for (const from of Object.keys(SIP_PROVISIONING_TRANSITIONS)) {
      for (const to of SIP_PROVISIONING_TRANSITIONS[
        from as keyof typeof SIP_PROVISIONING_TRANSITIONS
      ]) {
        expect(() =>
          assertSipProvisioningTransition(from as never, to as never),
        ).not.toThrow()
      }
    }
  })
})

describe("sipProvisioningService.provision", () => {
  const fetchSipPassword = vi.fn(async () => "meta-sip-password")

  beforeEach(() => {
    fetchSipPassword.mockClear()
    fetchSipPassword.mockResolvedValue("meta-sip-password")
  })

  test("concurrent provision: a second caller sees the claim unavailable", async () => {
    mocks.claimSipProvisioning.mockResolvedValueOnce(null)

    await expect(
      sipProvisioningService.provision({
        workspaceId: "ws-1",
        integrationId: "iw-1",
        nodeIds: ["default"],
        fetchSipPassword,
      }),
    ).rejects.toBeInstanceOf(SipProvisioningClaimUnavailableError)
  })

  test("happy path: pins node, stores encrypted password, rescans, verifies gateway, sets provisioned", async () => {
    mocks.claimSipProvisioning.mockResolvedValueOnce(baseClaimedRow)

    const result = await sipProvisioningService.provision({
      workspaceId: "ws-1",
      integrationId: "iw-1",
      nodeIds: ["default"],
      fetchSipPassword,
    })

    expect(mocks.pinWorkspaceToNode).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      nodeIds: ["default"],
    })
    expect(mocks.encryptText).toHaveBeenCalledWith("meta-sip-password")
    expect(mocks.freeswitchRun).toHaveBeenCalledWith("default", {
      kind: "sofiaProfileRescan",
      profile: "whatsapp",
    })
    expect(mocks.freeswitchRun).toHaveBeenCalledWith("default", {
      kind: "sofiaGatewayStatus",
      gateway: "wa-iw-1",
    })
    expect(result.sipProvisioningStatus).toBe("provisioned")
  })

  test("missing Meta SIP credentials marks the row failed and rethrows", async () => {
    mocks.claimSipProvisioning.mockResolvedValueOnce(baseClaimedRow)
    fetchSipPassword.mockResolvedValueOnce(undefined)

    await expect(
      sipProvisioningService.provision({
        workspaceId: "ws-1",
        integrationId: "iw-1",
        nodeIds: ["default"],
        fetchSipPassword,
      }),
    ).rejects.toBeInstanceOf(SipProvisioningMissingCredentialsError)

    expect(mocks.updateSipProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ sipProvisioningStatus: "failed" }),
      }),
    )
  })

  test("ESL failure (rescan/status throws) marks the row failed and rethrows", async () => {
    mocks.claimSipProvisioning.mockResolvedValueOnce(baseClaimedRow)
    mocks.freeswitchRun.mockRejectedValueOnce(
      new Error("freeswitch-api-timeout"),
    )

    await expect(
      sipProvisioningService.provision({
        workspaceId: "ws-1",
        integrationId: "iw-1",
        nodeIds: ["default"],
        fetchSipPassword,
      }),
    ).rejects.toThrow("freeswitch-api-timeout")

    expect(mocks.updateSipProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          sipProvisioningStatus: "failed",
          sipLastError: "freeswitch-api-timeout",
        }),
      }),
    )
  })

  test("gateway never comes up (status reply lacks the gateway name) -> SipProvisioningGatewayError", async () => {
    mocks.claimSipProvisioning.mockResolvedValueOnce(baseClaimedRow)
    mocks.freeswitchRun
      .mockResolvedValueOnce({ ok: true, reply: "+OK" })
      .mockResolvedValueOnce({ ok: true, reply: "-ERR no such gateway" })

    await expect(
      sipProvisioningService.provision({
        workspaceId: "ws-1",
        integrationId: "iw-1",
        nodeIds: ["default"],
        fetchSipPassword,
      }),
    ).rejects.toBeInstanceOf(SipProvisioningGatewayError)
  })
})

describe("sipProvisioningService.deprovision", () => {
  test("no-op when already none", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      id: "iw-1",
      workspaceId: "ws-1",
      sipProvisioningStatus: "none",
    })

    const result = await sipProvisioningService.deprovision({
      workspaceId: "ws-1",
      integrationId: "iw-1",
    })
    expect(result?.sipProvisioningStatus).toBe("none")
    expect(mocks.freeswitchRun).not.toHaveBeenCalled()
  })

  test("an enabled integration disables Meta SIP FIRST, then kills the gateway", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      id: "iw-1",
      workspaceId: "ws-1",
      sipProvisioningStatus: "enabled",
      sipGatewayName: "wa-iw-1",
      sipNodeId: "default",
      sipProvisioningClaim: "claim-1",
    })
    const disableMetaSip = vi.fn(async () => undefined)

    await sipProvisioningService.deprovision({
      workspaceId: "ws-1",
      integrationId: "iw-1",
      disableMetaSip,
    })

    expect(disableMetaSip).toHaveBeenCalledOnce()
    expect(disableMetaSip.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.freeswitchRun.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(mocks.freeswitchRun).toHaveBeenCalledWith("default", {
      kind: "sofiaGatewayKill",
      profile: "whatsapp",
      gateway: "wa-iw-1",
    })
  })

  test("an enabled integration cannot be deprovisioned without a Meta disable hook", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      id: "iw-1",
      workspaceId: "ws-1",
      sipProvisioningStatus: "enabled",
      sipGatewayName: "wa-iw-1",
      sipNodeId: "default",
      sipProvisioningClaim: "claim-1",
    })

    await expect(
      sipProvisioningService.deprovision({
        workspaceId: "ws-1",
        integrationId: "iw-1",
      }),
    ).rejects.toThrow(SipProvisioningTransitionError)
    expect(mocks.freeswitchRun).not.toHaveBeenCalled()
  })

  test("kills the gateway and clears the row when provisioned", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      id: "iw-1",
      workspaceId: "ws-1",
      sipProvisioningStatus: "provisioned",
      sipGatewayName: "wa-iw-1",
      sipNodeId: "default",
      sipProvisioningClaim: "claim-1",
    })

    await sipProvisioningService.deprovision({
      workspaceId: "ws-1",
      integrationId: "iw-1",
    })

    expect(mocks.freeswitchRun).toHaveBeenCalledWith("default", {
      kind: "sofiaGatewayKill",
      profile: "whatsapp",
      gateway: "wa-iw-1",
    })
    expect(mocks.updateSipProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: "claim-1",
        values: expect.objectContaining({ sipProvisioningStatus: "none" }),
      }),
    )
  })
})
