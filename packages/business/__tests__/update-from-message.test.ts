import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirstWorkspace,
  mockFindFirstContact,
  mockUpdate,
  mockSet,
  mockWhere,
  mockEmitContactInfoUpdated,
} = vi.hoisted(() => ({
  mockFindFirstWorkspace: vi.fn(),
  mockFindFirstContact: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
  mockEmitContactInfoUpdated: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockUpdate,
    query: {
      workspaceModel: { findFirst: mockFindFirstWorkspace },
      contactModel: { findFirst: mockFindFirstContact },
    },
  },
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactInfoUpdated: mockEmitContactInfoUpdated,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {
    id: "id",
    phoneNumber: "phoneNumber",
    email: "email",
    workspaceId: "workspaceId",
  },
}))

import { updateContactFromMessage } from "../src/contact/update-from-message"

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirstWorkspace.mockResolvedValue({ targetCountry: "VN" })
  mockFindFirstContact.mockResolvedValue({ phoneNumber: null, email: null })
  mockSet.mockReturnValue({ where: mockWhere })
  mockWhere.mockResolvedValue(undefined)
  mockUpdate.mockReturnValue({ set: mockSet })
})

describe("updateContactFromMessage", () => {
  test("no-ops on empty text — no workspace lookup, no update", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "",
    })
    expect(result).toEqual({})
    expect(mockFindFirstWorkspace).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("no-ops on null text", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: null,
    })
    expect(result).toEqual({})
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("phone-only message → updates phoneNumber only", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "call me at 0912345678",
    })
    expect(result).toEqual({ phoneNumber: "+84912345678" })
    expect(mockSet).toHaveBeenCalledWith({ phoneNumber: "+84912345678" })
  })

  test("email-only message → updates email only", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "reach me at jane@acme.com",
    })
    expect(result).toEqual({ email: "jane@acme.com" })
    expect(mockSet).toHaveBeenCalledWith({ email: "jane@acme.com" })
  })

  test("both phone + email → single UPDATE with both fields", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "phone 0912345678 mail jane@acme.com",
    })
    expect(result).toEqual({
      phoneNumber: "+84912345678",
      email: "jane@acme.com",
    })
    expect(mockSet).toHaveBeenCalledOnce()
    expect(mockSet).toHaveBeenCalledWith({
      phoneNumber: "+84912345678",
      email: "jane@acme.com",
    })
  })

  test("no extraction match → no UPDATE", async () => {
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "hello how are you today",
    })
    expect(result).toEqual({})
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("missing workspace.targetCountry falls back to extractor defaults", async () => {
    mockFindFirstWorkspace.mockResolvedValueOnce(undefined)
    const result = await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "ring +84 912 345 678",
    })
    expect(result.phoneNumber).toBe("+84912345678")
    expect(mockSet).toHaveBeenCalledWith({ phoneNumber: "+84912345678" })
  })

  test("reads the contact row only on extraction hits — no-match path stays query-free", async () => {
    await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "hello how are you today",
    })
    expect(mockFindFirstContact).not.toHaveBeenCalled()

    await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "new number 0912345678",
    })
    expect(mockFindFirstContact).toHaveBeenCalledOnce()
    expect(mockSet).toHaveBeenCalledWith({ phoneNumber: "+84912345678" })
  })

  test("emits contactInfoUpdated with old and new values when the phone changed", async () => {
    mockFindFirstContact.mockResolvedValueOnce({
      phoneNumber: "+84900000000",
      email: null,
    })
    await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "new number 0912345678",
    })
    expect(mockEmitContactInfoUpdated).toHaveBeenCalledExactlyOnceWith(
      "w1",
      "c1",
      "phone",
      "+84900000000",
      "+84912345678",
    )
  })

  test("does not emit when the extracted value matches the stored value", async () => {
    mockFindFirstContact.mockResolvedValueOnce({
      phoneNumber: "+84912345678",
      email: null,
    })
    await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "same number 0912345678",
    })
    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })

  test("does not emit when the contact row no longer exists", async () => {
    mockFindFirstContact.mockResolvedValueOnce(undefined)
    await updateContactFromMessage({
      contactId: "c1",
      workspaceId: "w1",
      text: "new number 0912345678",
    })
    expect(mockEmitContactInfoUpdated).not.toHaveBeenCalled()
  })

  test("channel-agnostic: same call shape works for any caller (no channel arg)", async () => {
    // The helper takes no channel param — callers from messenger, whatsapp,
    // telegram, zalo, webchat all invoke it the same way. Asserting the
    // surface (3 props only) is what every channel touches it with.
    const props = {
      contactId: "c1",
      workspaceId: "w1",
      text: "ping 0912345678",
    }
    await updateContactFromMessage(props)
    expect(mockSet).toHaveBeenCalledWith({ phoneNumber: "+84912345678" })
  })
})
