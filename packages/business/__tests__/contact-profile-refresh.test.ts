import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// packages/business/src/contact/profile-refresh — channel-agnostic module
// that decides whether a contact's profile name is missing, whether a
// channel may supply one, maps a fetched profile onto contact columns, rate
// limits channel-API attempts, applies the write with avatar compensation,
// and records non-fatal errors. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-1-brief.md
// ---------------------------------------------------------------------------

const warnMock = vi.fn()
const errorMock = vi.fn()
vi.mock("../src/logger", () => ({
  logger: { warn: warnMock, error: errorMock, info: vi.fn(), debug: vi.fn() },
}))

const existsMock = vi.fn(async () => false)
const setNumberMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { exists: existsMock, setNumber: setNumberMock },
}))

const findByIdOrFailMock = vi.fn()
const findByIdMock = vi.fn()
const updateMock = vi.fn()
vi.mock("../src/contact/service", () => ({
  contactService: {
    findByIdOrFail: findByIdOrFailMock,
    findById: findByIdMock,
    update: updateMock,
  },
}))

const logProviderErrorForChannelMock = vi.fn(async () => undefined)
vi.mock("../src/error-log/service", () => ({
  logProviderErrorForChannel: logProviderErrorForChannelMock,
}))

const deleteObjectMock = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: deleteObjectMock },
}))

const {
  applyContactProfile,
  buildContactProfileUpdate,
  contactProfileNameCapabilities,
  contactProfileRefreshService,
  COOLDOWN_BY_PROFILE_SOURCE,
  hasEmptyProfileName,
  hasOnDemandProfileApi,
  hasProfileName,
  isContactProfileRefreshCoolingDown,
  PROFILE_REFRESH_COOLDOWN_SECONDS,
  resolveInboundProfileNameSource,
  startContactProfileRefreshCooldown,
} = await import("../src/contact/profile-refresh")

const { channelTypes } = await import("@chatbotx.io/database/partials")

const NAMELESS_CONTACT = { firstName: null, lastName: null }
const CONTACT_INBOX = { id: "inbox-1", channel: "messenger" }

function refreshInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "ws-1",
    contactId: "contact-1",
    contactInbox: CONTACT_INBOX,
    source: "channelApi" as const,
    fetchProfile: vi.fn(async () => ({ firstName: "Jane" })),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  existsMock.mockResolvedValue(false)
  setNumberMock.mockResolvedValue(undefined)
  findByIdOrFailMock.mockResolvedValue({ ...NAMELESS_CONTACT })
  findByIdMock.mockResolvedValue(undefined)
  updateMock.mockImplementation(async (ctx, data) => ({
    id: ctx.id,
    workspaceId: ctx.workspaceId,
    ...data,
  }))
  logProviderErrorForChannelMock.mockResolvedValue(undefined)
  deleteObjectMock.mockResolvedValue(undefined)
})

// ─── rules.ts ────────────────────────────────────────────────────────────

describe("hasEmptyProfileName", () => {
  test("both blank → true", () => {
    expect(hasEmptyProfileName({ firstName: null, lastName: null })).toBe(true)
  })

  test("both whitespace-only → true", () => {
    expect(hasEmptyProfileName({ firstName: "   ", lastName: "  " })).toBe(true)
  })

  test("firstName only → false", () => {
    expect(hasEmptyProfileName({ firstName: "Jane", lastName: null })).toBe(
      false,
    )
  })

  test("lastName only → false", () => {
    expect(hasEmptyProfileName({ firstName: null, lastName: "Doe" })).toBe(
      false,
    )
  })
})

describe("hasProfileName", () => {
  test("both blank → false", () => {
    expect(hasProfileName({})).toBe(false)
  })

  test("both whitespace-only → false", () => {
    expect(hasProfileName({ firstName: "   ", lastName: "  " })).toBe(false)
  })

  test("firstName only → true", () => {
    expect(hasProfileName({ firstName: "Jane" })).toBe(true)
  })

  test("lastName only → true", () => {
    expect(hasProfileName({ lastName: "Doe" })).toBe(true)
  })
})

describe("buildContactProfileUpdate", () => {
  test("drops undefined fields", () => {
    const update = buildContactProfileUpdate({
      sourceId: "psid-1",
      firstName: "Jane",
    })

    expect(update).toEqual({ firstName: "Jane" })
  })

  test("keeps every field the profile returned", () => {
    const update = buildContactProfileUpdate({
      sourceId: "psid-1",
      firstName: "Jane",
      lastName: "Doe",
      avatar: "public/space/ws-1/avatars/abc",
      locale: "en_US",
      timezone: "+07:00",
      gender: "female",
    })

    expect(update).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      avatar: "public/space/ws-1/avatars/abc",
      locale: "en_US",
      timezone: "+07:00",
      gender: "female",
    })
  })

  test("invalid gender string is dropped", () => {
    const update = buildContactProfileUpdate({
      sourceId: "psid-1",
      firstName: "Jane",
      gender: "not-a-real-gender",
    })

    expect(update).toEqual({ firstName: "Jane" })
    expect(update.gender).toBeUndefined()
  })

  test("never emits fullName (generated column)", () => {
    const update = buildContactProfileUpdate({
      sourceId: "psid-1",
      firstName: "Jane",
      lastName: "Doe",
    })

    const allowedKeys = [
      "firstName",
      "lastName",
      "avatar",
      "locale",
      "timezone",
      "gender",
    ]
    expect(Object.keys(update).every((key) => allowedKeys.includes(key))).toBe(
      true,
    )
    expect("fullName" in update).toBe(false)
  })
})

describe("capability table", () => {
  test("resolveInboundProfileNameSource per channel", () => {
    const expected: Record<string, "channelApi" | "payload" | null> = {
      messenger: "channelApi",
      instagram: "channelApi",
      zalo: "channelApi",
      telegram: "channelApi",
      whatsapp: "payload",
      api: "payload",
      tiktok: null,
      webchat: null,
      smtp: null,
      omnichannel: null,
    }

    for (const [channel, source] of Object.entries(expected)) {
      expect(resolveInboundProfileNameSource(channel as never)).toBe(source)
    }
  })

  test("hasOnDemandProfileApi is true for exactly messenger/instagram/zalo/telegram", () => {
    const onDemandChannels = ["messenger", "instagram", "zalo", "telegram"]

    for (const channel of channelTypes.options) {
      expect(hasOnDemandProfileApi(channel)).toBe(
        onDemandChannels.includes(channel),
      )
    }
  })

  test("every channelTypes.options value has a capability row", () => {
    for (const channel of channelTypes.options) {
      expect(contactProfileNameCapabilities[channel]).toBeDefined()
    }
  })

  // `Inbox`/`ContactInbox`.`channel` is a plain `text()` column — callers
  // cast `as ChannelType`, so a legacy/unknown row must resolve to "no
  // source" instead of throwing on the missing table row.
  test("resolveInboundProfileNameSource returns null for an unknown channel string, never throws", () => {
    expect(() =>
      resolveInboundProfileNameSource("legacy" as never),
    ).not.toThrow()
    expect(resolveInboundProfileNameSource("legacy" as never)).toBeNull()
  })

  test("hasOnDemandProfileApi returns false for an unknown channel string, never throws", () => {
    expect(() => hasOnDemandProfileApi("legacy" as never)).not.toThrow()
    expect(hasOnDemandProfileApi("legacy" as never)).toBe(false)
  })
})

describe("COOLDOWN_BY_PROFILE_SOURCE", () => {
  test("payload is not rate-limited, channelApi is", () => {
    expect(COOLDOWN_BY_PROFILE_SOURCE).toEqual({
      payload: false,
      channelApi: true,
    })
  })
})

// ─── cooldown.ts ─────────────────────────────────────────────────────────

describe("isContactProfileRefreshCoolingDown", () => {
  test("true while the key exists", async () => {
    existsMock.mockResolvedValueOnce(true)

    await expect(isContactProfileRefreshCoolingDown("inbox-1")).resolves.toBe(
      true,
    )
    expect(existsMock).toHaveBeenCalledWith(
      "contact-profile-refresh:cooldown:inbox-1",
    )
  })

  test("false while the key is absent", async () => {
    existsMock.mockResolvedValueOnce(false)

    await expect(isContactProfileRefreshCoolingDown("inbox-1")).resolves.toBe(
      false,
    )
  })

  test("a Redis error is logged at warn and treated as not cooling down", async () => {
    existsMock.mockRejectedValueOnce(new Error("redis down"))

    await expect(isContactProfileRefreshCoolingDown("inbox-1")).resolves.toBe(
      false,
    )
    expect(warnMock).toHaveBeenCalled()
  })
})

describe("startContactProfileRefreshCooldown", () => {
  test("writes the key with a 300s TTL", async () => {
    await startContactProfileRefreshCooldown("inbox-1")

    expect(setNumberMock).toHaveBeenCalledWith(
      "contact-profile-refresh:cooldown:inbox-1",
      expect.any(Number),
      300,
    )
    expect(PROFILE_REFRESH_COOLDOWN_SECONDS).toBe(300)
  })

  test("a Redis write error is logged at warn and swallowed", async () => {
    setNumberMock.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      startContactProfileRefreshCooldown("inbox-1"),
    ).resolves.toBeUndefined()
    expect(warnMock).toHaveBeenCalled()
  })
})

// ─── service.ts: contactProfileRefreshService.refresh ──────────────────

describe("contactProfileRefreshService.refresh", () => {
  test("name present → skipped/profileComplete, no cooldown check, no fetch", async () => {
    findByIdOrFailMock.mockResolvedValueOnce({
      firstName: "Jane",
      lastName: null,
    })
    const fetchProfile = vi.fn()

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "skipped", reason: "profileComplete" })
    expect(existsMock).not.toHaveBeenCalled()
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  test("payload source: cooldown never checked nor started (unavailable outcome)", async () => {
    const fetchProfile = vi.fn(async () => null)

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ source: "payload", fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(existsMock).not.toHaveBeenCalled()
    expect(setNumberMock).not.toHaveBeenCalled()
  })

  test("payload source: cooldown never checked nor started (failed outcome)", async () => {
    const fetchProfile = vi.fn(() =>
      Promise.reject(new Error("resolution failed")),
    )

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ source: "payload", fetchProfile }),
    )

    expect(result).toEqual({ status: "failed" })
    expect(existsMock).not.toHaveBeenCalled()
    expect(setNumberMock).not.toHaveBeenCalled()
  })

  test("cooling down → skipped/coolingDown, no fetch", async () => {
    existsMock.mockResolvedValueOnce(true)
    const fetchProfile = vi.fn()

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "skipped", reason: "coolingDown" })
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  test("cooldown check throws → warn, fetch still runs", async () => {
    existsMock.mockRejectedValueOnce(new Error("redis down"))
    const fetchProfile = vi.fn(async () => ({ firstName: "Jane" }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(warnMock).toHaveBeenCalled()
    expect(fetchProfile).toHaveBeenCalled()
    expect(result.status).toBe("updated")
  })

  test("cooldown write throws → warn, result unchanged", async () => {
    setNumberMock.mockRejectedValueOnce(new Error("redis down"))
    const fetchProfile = vi.fn(async () => null)

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(warnMock).toHaveBeenCalled()
  })

  test("fetch throws → failed, error recorded, cooldown started, contact untouched", async () => {
    const error = new Error("graph error")
    const fetchProfile = vi.fn(() => Promise.reject(error))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "failed" })
    expect(logProviderErrorForChannelMock).toHaveBeenCalledWith("messenger", {
      workspaceId: "ws-1",
      contactId: "contact-1",
      error,
    })
    expect(setNumberMock).toHaveBeenCalledWith(
      "contact-profile-refresh:cooldown:inbox-1",
      expect.any(Number),
      300,
    )
    expect(updateMock).not.toHaveBeenCalled()
  })

  test("fetch returns null → unavailable, cooldown started, no write", async () => {
    const fetchProfile = vi.fn(async () => null)

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(setNumberMock).toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  test("fetch returns undefined → unavailable, cooldown started, no write", async () => {
    const fetchProfile = vi.fn(async () => undefined)

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(setNumberMock).toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  test("applyContactProfile throws → failed, cooldown started, new upload deleted (best-effort)", async () => {
    const fetchProfile = vi.fn(async () => ({
      firstName: "Jane",
      avatar: "public/space/ws-1/avatars/new",
    }))
    updateMock.mockRejectedValueOnce(new Error("db down"))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "failed" })
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "public/space/ws-1/avatars/new",
    )
    expect(setNumberMock).toHaveBeenCalled()
    expect(logProviderErrorForChannelMock).toHaveBeenCalled()
  })

  test("uploader.deleteObject throws after a write failure → logged, result unchanged", async () => {
    const fetchProfile = vi.fn(async () => ({
      firstName: "Jane",
      avatar: "public/space/ws-1/avatars/new",
    }))
    updateMock.mockRejectedValueOnce(new Error("db down"))
    deleteObjectMock.mockRejectedValueOnce(new Error("s3 down"))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "failed" })
    expect(warnMock).toHaveBeenCalled()
  })

  test("Error-Log write throws after a channel error → still failed, no rejection", async () => {
    const fetchProfile = vi.fn(() => Promise.reject(new Error("graph error")))
    logProviderErrorForChannelMock.mockRejectedValueOnce(
      new Error("error-log down"),
    )

    await expect(
      contactProfileRefreshService.refresh(refreshInput({ fetchProfile })),
    ).resolves.toEqual({ status: "failed" })
    expect(warnMock).toHaveBeenCalled()
  })

  test("fetch returns avatar/locale but no name → unavailable, no update, managed avatar deleted, cooldown started", async () => {
    const fetchProfile = vi.fn(async () => ({
      avatar: "public/space/ws-1/avatars/orphan",
      locale: "en_US",
    }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(updateMock).not.toHaveBeenCalled()
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "public/space/ws-1/avatars/orphan",
    )
    expect(setNumberMock).toHaveBeenCalled()
  })

  test("no usable name and an external (unmanaged) avatar → left untouched", async () => {
    const fetchProfile = vi.fn(async () => ({
      avatar: "https://cdn.example.com/pic.jpg",
    }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("no usable name and no avatar at all → nothing to delete", async () => {
    const fetchProfile = vi.fn(async () => ({ locale: "en_US" }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("happy path → updated, contactService.update called once with mapped data, no cooldown started", async () => {
    const fetchProfile = vi.fn(async () => ({
      firstName: "Jane",
      lastName: "Doe",
    }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result.status).toBe("updated")
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "contact-1", accessScope: undefined },
      { firstName: "Jane", lastName: "Doe" },
    )
    expect(setNumberMock).not.toHaveBeenCalled()
  })

  test("accessScope is forwarded to findByIdOrFail", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }

    await contactProfileRefreshService.refresh(refreshInput({ accessScope }))

    expect(findByIdOrFailMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessScope }),
    )
  })

  test("name filled between fetch and write → skipped/profileComplete, no update, uploaded avatar discarded, no cooldown", async () => {
    // findByIdOrFailMock (top-of-function read) still sees the nameless
    // contact from `beforeEach`; the re-check `findById` right before the
    // write sees a name that landed WHILE `fetchProfile` was in flight (an
    // operator edit, or a concurrent refresh).
    findByIdMock.mockResolvedValueOnce({
      firstName: "Jane",
      lastName: "Doe",
    })
    const fetchProfile = vi.fn(async () => ({
      firstName: "Jane",
      avatar: "public/space/ws-1/avatars/new",
    }))

    const result = await contactProfileRefreshService.refresh(
      refreshInput({ fetchProfile }),
    )

    expect(result).toEqual({ status: "skipped", reason: "profileComplete" })
    expect(updateMock).not.toHaveBeenCalled()
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "public/space/ws-1/avatars/new",
    )
    expect(setNumberMock).not.toHaveBeenCalled()
  })
})

// ─── service.ts: applyContactProfile ────────────────────────────────────

describe("applyContactProfile", () => {
  test("deletes the superseded managed avatar after the write", async () => {
    findByIdMock.mockResolvedValueOnce({
      avatar: "public/space/ws-1/avatars/old",
    })

    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      update: { avatar: "public/space/ws-1/avatars/new" },
    })

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "public/space/ws-1/avatars/old",
    )
  })

  test("leaves an external (unmanaged) avatar untouched", async () => {
    findByIdMock.mockResolvedValueOnce({
      avatar: "https://cdn.example.com/pic.jpg",
    })

    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      update: { avatar: "public/space/ws-1/avatars/new" },
    })

    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("no avatar in the update → previous avatar is never looked up or deleted", async () => {
    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      update: { firstName: "Jane" },
    })

    expect(findByIdMock).not.toHaveBeenCalled()
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("unchanged avatar path → not deleted", async () => {
    findByIdMock.mockResolvedValueOnce({
      avatar: "public/space/ws-1/avatars/same",
    })

    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      update: { avatar: "public/space/ws-1/avatars/same" },
    })

    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("no previous avatar → nothing to delete", async () => {
    findByIdMock.mockResolvedValueOnce(undefined)

    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      update: { avatar: "public/space/ws-1/avatars/new" },
    })

    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  test("uploader.deleteObject failure is swallowed and does not throw", async () => {
    findByIdMock.mockResolvedValueOnce({
      avatar: "public/space/ws-1/avatars/old",
    })
    deleteObjectMock.mockRejectedValueOnce(new Error("s3 down"))

    await expect(
      applyContactProfile({
        workspaceId: "ws-1",
        contactId: "contact-1",
        update: { avatar: "public/space/ws-1/avatars/new" },
      }),
    ).resolves.toBeDefined()
    expect(warnMock).toHaveBeenCalled()
  })

  test("forwards accessScope to findById and update", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    findByIdMock.mockResolvedValueOnce({
      avatar: "public/space/ws-1/avatars/old",
    })

    await applyContactProfile({
      workspaceId: "ws-1",
      contactId: "contact-1",
      accessScope,
      update: { avatar: "public/space/ws-1/avatars/new" },
    })

    expect(findByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessScope }),
    )
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessScope }),
      expect.anything(),
    )
  })
})
