import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the merge logic in the `updateMessengerContactData` flow-step handler
// (apps/worker/src/integration/handlers/messenger-contact-data.ts). We mock the
// Messenger context resolver, the profile fetch (runChannelHandler), and the
// contact service; we assert only which fields get written and that runtime
// failures are silent no-ops that never throw.
// ---------------------------------------------------------------------------

type Profile = {
  firstName?: string
  lastName?: string
  avatar?: string
  locale?: string
  timezone?: string
  gender?: string
}

const state = {
  context: null as unknown,
  profile: undefined as Profile | undefined,
  profileThrows: false,
  currentContact: undefined as { avatar?: string } | undefined,
}

const runChannelHandler = vi.fn(() =>
  state.profileThrows
    ? Promise.reject(new Error("graph error"))
    : Promise.resolve(state.profile),
)

const resolveMessengerUserContext = vi.fn(() => Promise.resolve(state.context))
vi.mock("../src/integration/handlers/messenger-context", () => ({
  resolveMessengerUserContext,
}))

const update = vi.fn(async () => undefined)
const findById = vi.fn(async () => state.currentContact)
vi.mock("@chatbotx.io/business", () => ({
  contactService: { update, findById },
}))

const deleteObject = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject },
}))

const loggerError = vi.fn()
vi.mock("../src/lib/logger", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { updateMessengerContactData } = await import(
  "../src/integration/handlers/messenger-contact-data"
)

function props(workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    step: { id: "s-1", stepType: "updateMessengerContactData" },
  } as unknown as Parameters<typeof updateMessengerContactData>[0]
}

function reset() {
  vi.clearAllMocks()
  state.context = {
    integration: { runChannelHandler },
    ctx: {},
    psid: "psid-1",
  }
  state.profile = {
    firstName: "Jane",
    lastName: "Doe",
    avatar: "public/space/ws-1/avatars/abc",
    locale: "en_US",
    timezone: "+07:00",
    gender: "female",
  }
  state.profileThrows = false
  state.currentContact = { avatar: "public/space/ws-1/avatars/old" }
  runChannelHandler.mockImplementation(() =>
    state.profileThrows
      ? Promise.reject(new Error("graph error"))
      : Promise.resolve(state.profile),
  )
}

describe("updateMessengerContactData", () => {
  beforeEach(reset)

  test("writes every field the profile returned, overwriting current values", async () => {
    await updateMessengerContactData(props())

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "c-1" },
      {
        firstName: "Jane",
        lastName: "Doe",
        avatar: "public/space/ws-1/avatars/abc",
        locale: "en_US",
        timezone: "+07:00",
        gender: "female",
      },
    )
  })

  test("undefined profile fields are never written", async () => {
    state.profile = { firstName: "Jane" }

    await updateMessengerContactData(props())

    expect(update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "c-1" },
      { firstName: "Jane" },
    )
  })

  test("no Messenger inbox → silent no-op", async () => {
    state.context = null

    await updateMessengerContactData(props())

    expect(runChannelHandler).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(loggerError).not.toHaveBeenCalled()
  })

  test("profile fetch error → logged, no update, does not throw", async () => {
    state.profileThrows = true

    await expect(updateMessengerContactData(props())).resolves.toBeUndefined()

    expect(update).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  test("empty profile → no update", async () => {
    state.profile = {}

    await updateMessengerContactData(props())

    expect(update).not.toHaveBeenCalled()
  })

  test("deletes the superseded avatar object after a new one is written", async () => {
    await updateMessengerContactData(props())

    expect(update).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith("public/space/ws-1/avatars/old")
  })

  test("no avatar in profile → previous avatar is left in place", async () => {
    state.profile = { firstName: "Jane" }

    await updateMessengerContactData(props())

    expect(findById).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  test("unchanged avatar path → not deleted", async () => {
    state.currentContact = { avatar: "public/space/ws-1/avatars/abc" }

    await updateMessengerContactData(props())

    expect(deleteObject).not.toHaveBeenCalled()
  })

  test("external / unmanaged avatar URL → not deleted", async () => {
    state.currentContact = { avatar: "https://cdn.example.com/pic.jpg" }

    await updateMessengerContactData(props())

    expect(deleteObject).not.toHaveBeenCalled()
  })

  test("no previous avatar → nothing to delete", async () => {
    state.currentContact = { avatar: undefined }

    await updateMessengerContactData(props())

    expect(update).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  test("delete failure is swallowed and does not throw", async () => {
    deleteObject.mockRejectedValueOnce(new Error("s3 down"))

    await expect(updateMessengerContactData(props())).resolves.toBeUndefined()

    expect(update).toHaveBeenCalledTimes(1)
  })
})
