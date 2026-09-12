import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listProvisionedForXml: vi.fn(),
  selectRingTargets: vi.fn(),
  findActiveBySipUsername: vi.fn(),
  findByAttemptId: vi.fn(),
  findPinByWorkspaceId: vi.fn(),
  decryptText: vi.fn(async (data: { text: string }) => `plain:${data.text}`),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    listProvisionedForXml: mocks.listProvisionedForXml,
  },
  whatsappCallRepository: { findByAttemptId: mocks.findByAttemptId },
  workspaceSipNodeRepository: {
    findByWorkspaceId: mocks.findPinByWorkspaceId,
  },
  agentSipPresenceRepository: { selectRingTargets: mocks.selectRingTargets },
  userSoftphoneCredentialRepository: {
    findActiveBySipUsername: mocks.findActiveBySipUsername,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { decryptText: mocks.decryptText },
}))

const { escapeXml, renderFreeswitchXml, XML_SECTION_RENDERERS } = await import(
  "../src/whatsapp-call/freeswitch-xml-service"
)

const nodes = {
  default: {
    sipDomain: "fs.example.com",
    wssUrl: "wss://fs.example.com:7443",
    turnUrl: "turn:fs.example.com:3478",
  },
}

const integration = {
  id: "iw-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  displayPhoneNumber: "+15551234567",
  sipGatewayName: "wa-iw-1",
  sipPasswordEncrypted: { v: 1, text: "secret", iv: "iv", tag: "tag" },
  sipProvisioningStatus: "provisioned",
  sipNodeId: "default",
  callRecordingEnabled: true,
}

const RECORDINGS_DIR = "/recordings"
// Literal FreeSWITCH placeholder expected in the rendered dialplan (never a
// template placeholder here) — built by concatenation like the service does.
// biome-ignore lint/complexity/noUselessStringConcat: intentional, see comment
const FS_UUID_PLACEHOLDER = "$" + "{uuid}"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listProvisionedForXml.mockResolvedValue([integration])
  mocks.selectRingTargets.mockResolvedValue([])
  mocks.findByAttemptId.mockResolvedValue({
    id: "call-1",
    inboxId: "inbox-1",
    workspaceId: "ws-1",
  })
  mocks.findPinByWorkspaceId.mockResolvedValue({
    workspaceId: "ws-1",
    nodeId: "default",
  })
})

describe("escapeXml", () => {
  test("escapes every dangerous character", () => {
    expect(escapeXml(`" & < > '`)).toBe("&quot; &amp; &lt; &gt; &apos;")
  })
})

describe("renderFreeswitchXml: not found cases", () => {
  test("an unknown hostname is not found before any DB read", async () => {
    const result = await renderFreeswitchXml(
      {
        hostname: "not-a-node",
        section: "configuration",
        key_value: "sofia.conf",
      },
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
    expect(mocks.listProvisionedForXml).not.toHaveBeenCalled()
  })

  test("malformed input is not found", async () => {
    const result = await renderFreeswitchXml(
      { nope: true },
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("configuration for anything other than sofia.conf is not found", async () => {
    const result = await XML_SECTION_RENDERERS.configuration(
      {
        hostname: "default",
        section: "configuration",
        key_value: "other.conf",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })
})

describe("configuration/sofia.conf", () => {
  test("lists this node's gateways with the decrypted password", async () => {
    const result = await XML_SECTION_RENDERERS.configuration(
      {
        hostname: "default",
        section: "configuration",
        key_value: "sofia.conf",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(mocks.listProvisionedForXml).toHaveBeenCalledWith("default")
    expect(result).toContain('<gateway name="wa-iw-1">')
    expect(result).toContain('value="plain:secret"')
    expect(result).toContain('value="15551234567"')
  })
})

describe("directory", () => {
  test("agent user: resolves by ag-<ws>-<user> and decrypts the credential", async () => {
    mocks.findActiveBySipUsername.mockResolvedValueOnce({
      workspaceId: "ws-1",
      passwordEncrypted: { v: 1, text: "agent-secret", iv: "iv", tag: "tag" },
    })

    const result = await XML_SECTION_RENDERERS.directory(
      {
        hostname: "default",
        section: "directory",
        key_name: "id",
        key_value: "ag-1-2",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(mocks.findActiveBySipUsername).toHaveBeenCalledWith("ag-1-2")
    expect(result).toContain('domain name="fs.example.com"')
    expect(result).toContain('value="plain:agent-secret"')
  })

  test("agent credential whose workspace is pinned to ANOTHER node -> not found (node-secret isolation)", async () => {
    mocks.findActiveBySipUsername.mockResolvedValueOnce({
      workspaceId: "ws-1",
      passwordEncrypted: { v: 1, text: "agent-secret", iv: "iv", tag: "tag" },
    })
    mocks.findPinByWorkspaceId.mockResolvedValueOnce({
      workspaceId: "ws-1",
      nodeId: "node-b",
    })
    const result = await XML_SECTION_RENDERERS.directory(
      {
        hostname: "default",
        section: "directory",
        key_name: "id",
        key_value: "ag-1-2",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
    expect(mocks.decryptText).not.toHaveBeenCalled()
  })

  test("agent user not found (revoked/expired) -> not found", async () => {
    mocks.findActiveBySipUsername.mockResolvedValueOnce(undefined)
    const result = await XML_SECTION_RENDERERS.directory(
      {
        hostname: "default",
        section: "directory",
        key_name: "id",
        key_value: "ag-1-2",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("business number: resolves by digits against the node's provisioned integrations", async () => {
    const result = await XML_SECTION_RENDERERS.directory(
      {
        hostname: "default",
        section: "directory",
        key_name: "id",
        key_value: "15551234567",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('value="plain:secret"')
  })

  test("wrong-node attempt (key_value not matching any of this node's integrations) -> not found", async () => {
    mocks.listProvisionedForXml.mockResolvedValueOnce([])
    const result = await XML_SECTION_RENDERERS.directory(
      {
        hostname: "default",
        section: "directory",
        key_name: "id",
        key_value: "19998887777",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })
})

describe("dialplan: whatsapp_inbound", () => {
  const inboundRequest = {
    hostname: "default",
    section: "dialplan",
    "Caller-Destination-Number": "+15551234567",
    "variable_sip_h_x-wa-meta-wacid": "wacid.abc",
    variable_sofia_profile_name: "whatsapp",
  }

  test("bridges to the selected ring targets when agents are registered", async () => {
    mocks.selectRingTargets.mockResolvedValueOnce(["10", "11", "12"])

    const result = await XML_SECTION_RENDERERS.dialplan(
      inboundRequest as never,
      {
        nodes,
        recordingsDir: RECORDINGS_DIR,
      },
    )

    expect(result).toContain('<context name="whatsapp_inbound">')
    expect(result).toContain("cbx_wacid=wacid.abc")
    expect(result).toContain("cbx_integration_id=iw-1")
    expect(result).toContain("cbx_workspace_id=ws-1")
    expect(result).toContain(
      'data="{ignore_early_media=true}user/ag-ws-1-10@fs.example.com,user/ag-ws-1-11@fs.example.com,user/ag-ws-1-12@fs.example.com"',
    )
    expect(result).toContain("record_session")
    // Softphone correlation header: every agent leg's INVITE
    // carries the root uuid so the browser can match ringing SIP calls to
    // the realtime event.
    expect(result).toContain("sip_h_X-CBX-Root-UUID")
    expect(result.indexOf("sip_h_X-CBX-Root-UUID")).toBeLessThan(
      result.indexOf('application="bridge"'),
    )
  })

  test("no registered agents -> plays the no-agent prompt, no bridge, no 25s ring", async () => {
    mocks.selectRingTargets.mockResolvedValueOnce([])

    const result = await XML_SECTION_RENDERERS.dialplan(
      inboundRequest as never,
      {
        nodes,
        recordingsDir: RECORDINGS_DIR,
      },
    )

    expect(result).not.toContain('application="bridge"')
    expect(result).toContain('application="playback"')
  })

  test("recording disabled for the integration -> no record_session action", async () => {
    mocks.listProvisionedForXml.mockResolvedValueOnce([
      { ...integration, callRecordingEnabled: false },
    ])

    const result = await XML_SECTION_RENDERERS.dialplan(
      inboundRequest as never,
      {
        nodes,
        recordingsDir: RECORDINGS_DIR,
      },
    )
    expect(result).not.toContain("record_session")
  })

  test("an invalid destination number is not found", async () => {
    const result = await XML_SECTION_RENDERERS.dialplan(
      {
        ...inboundRequest,
        "Caller-Destination-Number": "abc; rm -rf",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("a wacid header value with XML-dangerous characters is escaped", async () => {
    mocks.selectRingTargets.mockResolvedValueOnce([])
    const result = await XML_SECTION_RENDERERS.dialplan(
      {
        ...inboundRequest,
        "variable_sip_h_x-wa-meta-wacid": `"><script>evil</script>`,
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).not.toContain("<script>")
    expect(result).toContain("&lt;script&gt;")
  })
})

describe("dialplan: agents (outbound)", () => {
  const outboundRequest = {
    hostname: "default",
    section: "dialplan",
    "Caller-Destination-Number": "+15559998888",
    "variable_sip_h_X-CBX-Attempt": "att123abc",
    variable_sofia_profile_name: "agents",
  }

  test("bridges through the attempt's own integration gateway on this node", async () => {
    mocks.listProvisionedForXml.mockResolvedValueOnce([
      {
        ...integration,
        id: "iw-other",
        inboxId: "inbox-other",
        sipGatewayName: "wa-other",
      },
      integration,
    ])
    const result = await XML_SECTION_RENDERERS.dialplan(
      outboundRequest as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(mocks.findByAttemptId).toHaveBeenCalledWith("att123abc")
    expect(result).toContain('<context name="agents">')
    expect(result).toContain("cbx_attempt_id=att123abc")
    expect(result).toContain('data="sofia/gateway/wa-iw-1/+15559998888"')
    expect(result).toContain(
      `data="/recordings/wa/ws-1/${FS_UUID_PLACEHOLDER}.ogg"`,
    )
  })

  test("an unknown attempt is not found", async () => {
    mocks.findByAttemptId.mockResolvedValueOnce(undefined)
    const result = await XML_SECTION_RENDERERS.dialplan(
      outboundRequest as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("an attempt whose integration is pinned to another node is not found", async () => {
    mocks.findByAttemptId.mockResolvedValueOnce({
      id: "call-2",
      inboxId: "inbox-on-node-b",
      workspaceId: "ws-1",
    })
    const result = await XML_SECTION_RENDERERS.dialplan(
      outboundRequest as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("an invalid X-CBX-Attempt header is not found", async () => {
    const result = await XML_SECTION_RENDERERS.dialplan(
      {
        ...outboundRequest,
        "variable_sip_h_X-CBX-Attempt": "bad id; rm -rf",
      } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })

  test("unknown sofia profile is not found (no renderer registered)", async () => {
    const result = await XML_SECTION_RENDERERS.dialplan(
      { ...outboundRequest, variable_sofia_profile_name: "unknown" } as never,
      { nodes, recordingsDir: RECORDINGS_DIR },
    )
    expect(result).toContain('status="not found"')
  })
})
