// @vitest-environment node
import { describe, expect, test } from "vitest"
import { buildNotificationContent } from "../../src/notification/lib/build-notification-content"

const incomingMessageJob = (data: Record<string, unknown> = {}) =>
  ({
    type: "notifyIncomingMessage",
    data: {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      ...data,
    },
  }) as never

const assignedJob = () =>
  ({
    type: "notifyConversationAssigned",
    data: {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      assignedUserId: "user-1",
    },
  }) as never

describe("buildNotificationContent", () => {
  test("uses contact full name as title", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ messageText: "Hey there" }),
      contactFullName: "Jane Doe",
      workspaceLanguage: "en",
    })
    expect(result.title).toBe("Jane Doe")
    expect(result.body).toBe("Hey there")
  })

  test("falls back to generic title when contact has no name", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ messageText: "Hey there" }),
      contactFullName: null,
      workspaceLanguage: "en",
    })
    expect(result.title).toBe("New message")
  })

  test("uses location placeholder body", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ contentType: "location" }),
      contactFullName: "Jane",
      workspaceLanguage: "en",
    })
    expect(result.body).toBe("Shared a location")
  })

  test("uses refLink placeholder body", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ contentType: "refLink" }),
      contactFullName: "Jane",
      workspaceLanguage: "en",
    })
    expect(result.body).toBe("Sent a link")
  })

  test("uses singular attachment copy", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ attachmentCount: 1 }),
      contactFullName: "Jane",
      workspaceLanguage: "en",
    })
    expect(result.body).toBe("Sent an attachment")
  })

  test("uses plural attachment-count copy", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ attachmentCount: 2 }),
      contactFullName: "Jane",
      workspaceLanguage: "en",
    })
    expect(result.body).toBe("Sent 2 attachments")
  })

  test("assigned-conversation copy is templated", () => {
    const result = buildNotificationContent({
      job: assignedJob(),
      contactFullName: "Jane",
      workspaceLanguage: "en",
    })
    expect(result.title).toBe("Jane")
    expect(result.body).toBe("You were assigned a conversation")
  })

  test("falls back to en for an unknown workspace language", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ contentType: "location" }),
      contactFullName: "Jane",
      workspaceLanguage: "fr",
    })
    expect(result.body).toBe("Shared a location")
  })

  test("falls back to en when workspace language is undefined", () => {
    const result = buildNotificationContent({
      job: incomingMessageJob({ contentType: "location" }),
      contactFullName: "Jane",
      workspaceLanguage: undefined,
    })
    expect(result.body).toBe("Shared a location")
  })
})
