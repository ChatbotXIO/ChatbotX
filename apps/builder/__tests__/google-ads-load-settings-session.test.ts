// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  findLatestInFlightByProvider: vi.fn(),
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findLatestInFlightByProvider: mocks.findLatestInFlightByProvider,
  },
}))

const { loadSettingsSession, parseConnectErrorParam } = await import(
  "@/features/integration-google-ads/lib/load-settings-session"
)

const WORKSPACE_ID = "100"
const session = (status: string, provider = "googleAds") => ({
  id: "300",
  provider,
  status,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIdForWorkspace.mockResolvedValue(undefined)
  mocks.findLatestInFlightByProvider.mockResolvedValue(undefined)
})

describe("loadSettingsSession with ?session=", () => {
  test.each([
    "pending",
    "authorized",
    "awaiting_selection",
    "completed",
    "failed",
    "expired",
    "cancelled",
  ])("surfaces a %s session so the picker can render it", async (status) => {
    mocks.findByIdForWorkspace.mockResolvedValue(session(status))

    const result = await loadSettingsSession({
      workspaceId: WORKSPACE_ID,
      sessionParam: "300",
    })

    expect(result).toEqual({ id: "300", status })
    expect(mocks.findLatestInFlightByProvider).not.toHaveBeenCalled()
  })

  test("looks the session up scoped to the workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(session("failed"))

    await loadSettingsSession({
      workspaceId: WORKSPACE_ID,
      sessionParam: "300",
    })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "300",
      workspaceId: WORKSPACE_ID,
    })
  })

  test("a failed reconnect session is returned for display", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({
      ...session("failed"),
      purpose: "reconnect",
      errorCode: "provider_denied",
    })

    await expect(
      loadSettingsSession({ workspaceId: WORKSPACE_ID, sessionParam: "300" }),
    ).resolves.toEqual({ id: "300", status: "failed" })
  })

  test("ignores a session of another provider and falls back to the in-flight one", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(session("failed", "messenger"))
    mocks.findLatestInFlightByProvider.mockResolvedValue({
      id: "301",
      status: "awaiting_selection",
    })

    await expect(
      loadSettingsSession({ workspaceId: WORKSPACE_ID, sessionParam: "300" }),
    ).resolves.toEqual({ id: "301", status: "awaiting_selection" })
    expect(mocks.findLatestInFlightByProvider).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      provider: "googleAds",
    })
  })

  test("a session of another workspace (not found) falls back to in-flight, then null", async () => {
    await expect(
      loadSettingsSession({ workspaceId: WORKSPACE_ID, sessionParam: "999" }),
    ).resolves.toBeNull()
  })

  test.each([
    "abc",
    "1; DROP",
    "",
    "123456789012345678901",
  ])("a malformed param %j is ignored without a lookup by id", async (raw) => {
    await loadSettingsSession({ workspaceId: WORKSPACE_ID, sessionParam: raw })

    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("uses the first value of a repeated param", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(session("expired"))

    await loadSettingsSession({
      workspaceId: WORKSPACE_ID,
      sessionParam: ["300", "400"],
    })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "300",
      workspaceId: WORKSPACE_ID,
    })
  })
})

describe("loadSettingsSession without ?session=", () => {
  test("resumes the newest in-flight Google Ads session", async () => {
    mocks.findLatestInFlightByProvider.mockResolvedValue({
      id: "301",
      status: "awaiting_selection",
    })

    await expect(
      loadSettingsSession({
        workspaceId: WORKSPACE_ID,
        sessionParam: undefined,
      }),
    ).resolves.toEqual({ id: "301", status: "awaiting_selection" })
    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("resumes an authorized session (the user is back from Google)", async () => {
    mocks.findLatestInFlightByProvider.mockResolvedValue({
      id: "302",
      status: "authorized",
    })

    await expect(
      loadSettingsSession({
        workspaceId: WORKSPACE_ID,
        sessionParam: undefined,
      }),
    ).resolves.toEqual({ id: "302", status: "authorized" })
  })

  test("does not resume an abandoned `pending` authorization (no endless 'waiting for Google')", async () => {
    mocks.findLatestInFlightByProvider.mockResolvedValue({
      id: "303",
      status: "pending",
    })

    await expect(
      loadSettingsSession({
        workspaceId: WORKSPACE_ID,
        sessionParam: undefined,
      }),
    ).resolves.toBeNull()
  })

  test("is null when nothing is in flight", async () => {
    await expect(
      loadSettingsSession({
        workspaceId: WORKSPACE_ID,
        sessionParam: undefined,
      }),
    ).resolves.toBeNull()
  })
})

describe("loadSettingsSession with a matching ?session= still pending", () => {
  test("shows the waiting state while the callback lands", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(session("pending"))

    await expect(
      loadSettingsSession({ workspaceId: WORKSPACE_ID, sessionParam: "300" }),
    ).resolves.toEqual({ id: "300", status: "pending" })
  })
})

describe("parseConnectErrorParam", () => {
  test.each([
    "provider_unavailable",
    "internal_error",
    "no_candidates",
    "developer_token_not_approved",
    "developer_token_missing",
    "project_not_approved",
    "permission_denied",
    "api_not_enabled",
    "credentials_invalid",
  ])("accepts the known code %s", (code) => {
    expect(parseConnectErrorParam(code)).toBe(code)
  })

  test.each([
    undefined,
    "",
    "nope",
    "<script>alert(1)</script>",
    "INTERNAL_ERROR",
    "internal_error ",
    ["bogus", "internal_error"],
  ])("ignores a missing, unknown or forged value %j", (value) => {
    expect(parseConnectErrorParam(value)).toBeNull()
  })

  test("uses only the first of a repeated parameter", () => {
    expect(parseConnectErrorParam(["permission_denied", "x"])).toBe(
      "permission_denied",
    )
  })
})
