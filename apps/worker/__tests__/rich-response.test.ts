import { ChatJobAction, IntegrationJobAction } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { parseRichResponse } from "../src/integration/handlers/rich-response"
import { executeRichActions } from "../src/integration/handlers/rich-response/action-executor"
import { sendRichMessages } from "../src/integration/handlers/rich-response/message-sender"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const chatQueueAddBulk = vi.hoisted(() => vi.fn(async () => undefined))
const integrationQueueAdd = vi.hoisted(() => vi.fn(async () => undefined))
const loggerWarnMock = vi.hoisted(() => vi.fn())

const attachTagsByNamesMock = vi.hoisted(() => vi.fn(async () => undefined))
const detachTagsByNamesMock = vi.hoisted(() => vi.fn(async () => undefined))

const setRichSystemFieldByKeyMock = vi.hoisted(() =>
  vi.fn(async () => undefined),
)
const unsetRichSystemFieldByKeyMock = vi.hoisted(() =>
  vi.fn(async () => undefined),
)
const setValueByKeyMock = vi.hoisted(() => vi.fn(async () => undefined))
const deleteByKeyMock = vi.hoisted(() => vi.fn(async () => undefined))
const flowExistsMock = vi.hoisted(() => vi.fn(async () => true))
const findByWorkspaceIdAndUserIdMock = vi.hoisted(() =>
  vi.fn(async () => ({ userId: "admin-1" })),
)
const updateAssignmentMock = vi.hoisted(() => vi.fn(async () => undefined))
const handoffExecuteMock = vi.hoisted(() => vi.fn(async () => undefined))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    chatQueue: { addBulk: chatQueueAddBulk },
    integrationQueue: { add: integrationQueueAdd },
  }
})

vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    ...actual,
    contactService: {
      setRichSystemFieldByKey: setRichSystemFieldByKeyMock,
      unsetRichSystemFieldByKey: unsetRichSystemFieldByKeyMock,
    },
    contactCustomFieldService: {
      setValueByKey: setValueByKeyMock,
      deleteByKey: deleteByKeyMock,
    },
    flowService: { exists: flowExistsMock },
    workspaceMemberService: {
      findByWorkspaceIdAndUserId: findByWorkspaceIdAndUserIdMock,
    },
    conversationService: { updateAssignment: updateAssignmentMock },
    isRichSystemContactField: (field: string) =>
      [
        "phone",
        "phone_number",
        "email",
        "full_name",
        "first_name",
        "last_name",
      ].includes(field),
  }
})

vi.mock("../src/integration/handlers/contact", () => ({
  attachTagsByNames: attachTagsByNamesMock,
  detachTagsByNames: detachTagsByNamesMock,
}))

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: handoffExecuteMock },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Shared context fixture
// ---------------------------------------------------------------------------

const ctx = {
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactId: "contact-1",
  contactInboxId: "inbox-1",
  executionId: "exec-1",
  flowContextId: "flow-ctx-1",
}

// ---------------------------------------------------------------------------
// rich response parser
// ---------------------------------------------------------------------------

describe("rich response parser", () => {
  test("accepts messages-only, actions-only, and fenced JSON responses", () => {
    const messagesOnly = parseRichResponse(
      JSON.stringify({
        messages: [{ message: { text: "Hello" } }],
      }),
    )
    expect(messagesOnly.ok).toBe(true)

    const actionsOnly = parseRichResponse(
      JSON.stringify({
        actions: [{ action: "add_tag", tag_name: "lead" }],
      }),
    )
    expect(actionsOnly.ok).toBe(true)

    const fenced = parseRichResponse(`\`\`\`json
{"messages":[{"message":{"text":"Hello"}}],"actions":[]}
\`\`\``)
    expect(fenced.ok).toBe(true)
  })

  test("accepts a valid rich JSON response followed by duplicate plain text", () => {
    const result = parseRichResponse(
      `${JSON.stringify({
        messages: [
          {
            message: {
              text: "Mình đã ghi nhận bạn quan tâm đến áo khoác, ngân sách khoảng 500k.",
              quick_replies: [
                {
                  content_type: "text",
                  title: "Áo khoác bomber",
                  payload: "bomber",
                },
              ],
            },
          },
        ],
        actions: [
          { action: "add_tag", tag_name: "lead" },
          {
            action: "set_field_value",
            field_name: "interest",
            value: "áo khoác",
          },
          { action: "set_field_value", field_name: "budget", value: "500k" },
        ],
      })}Mình đã ghi nhận bạn quan tâm đến áo khoác, ngân sách khoảng 500k.`,
    )

    expect(result).toMatchObject({
      ok: true,
      data: {
        actions: [
          { action: "add_tag", tag_name: "lead" },
          {
            action: "set_field_value",
            field_name: "interest",
            value: "áo khoác",
          },
          { action: "set_field_value", field_name: "budget", value: "500k" },
        ],
      },
    })
  })

  test("classifies plain text and schema errors explicitly", () => {
    expect(parseRichResponse("I can help with that.")).toMatchObject({
      ok: false,
      reason: "plain_text",
    })

    expect(parseRichResponse(JSON.stringify({ messages: [31] }))).toMatchObject(
      {
        ok: false,
        reason: "schema_error",
      },
    )
  })

  test("truncates button and quick reply titles longer than Messenger limit", () => {
    const longTitle = "x".repeat(21)
    const truncated = "x".repeat(20)

    const buttonResult = parseRichResponse(
      JSON.stringify({
        messages: [
          {
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "button",
                  text: "Pick one",
                  buttons: [
                    {
                      type: "postback",
                      title: longTitle,
                      payload: "payload",
                    },
                  ],
                },
              },
            },
          },
        ],
      }),
    )
    expect(buttonResult).toMatchObject({ ok: true })
    if (buttonResult.ok) {
      const msg = buttonResult.data.messages[0] as {
        message: { attachment: { payload: { buttons: { title: string }[] } } }
      }
      expect(msg.message.attachment.payload.buttons.at(0)?.title).toBe(
        truncated,
      )
    }

    const qrResult = parseRichResponse(
      JSON.stringify({
        messages: [
          {
            message: {
              text: "Choose",
              quick_replies: [
                {
                  content_type: "text",
                  title: longTitle,
                  payload: "payload",
                },
              ],
            },
          },
        ],
      }),
    )
    expect(qrResult).toMatchObject({ ok: true })
    if (qrResult.ok) {
      const msg = qrResult.data.messages[0] as {
        message: { quick_replies: { title: string }[] }
      }
      expect(msg.message.quick_replies.at(0)?.title).toBe(truncated)
    }
  })
})

// ---------------------------------------------------------------------------
// sendRichMessages
// ---------------------------------------------------------------------------

describe("sendRichMessages", () => {
  beforeEach(() => {
    chatQueueAddBulk.mockClear()
    loggerWarnMock.mockClear()
  })

  test("enqueues converted messages with cumulative delay and rich button metadata", async () => {
    const result = await sendRichMessages(
      [
        {
          message: {
            text: "Choose",
            quick_replies: [
              {
                content_type: "text",
                title: "Start",
                payload: "12345",
              },
            ],
          },
        },
        4,
        {
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: "Pick one",
                buttons: [
                  {
                    type: "web_url",
                    title: "Website",
                    url: "https://example.com",
                  },
                  {
                    type: "postback",
                    title: "Tag me",
                    payload: JSON.stringify({
                      actions: [{ action: "add_tag", tag_name: "lead" }],
                    }),
                  },
                ],
              },
            },
          },
        },
      ],
      {
        workspaceId: "1",
        conversationId: "2",
        contactId: "3",
        contactInboxId: "4",
        executionId: "5",
        flowContextId: "6",
      },
    )

    expect(result).toEqual({ enqueued: 2, skipped: 0 })
    expect(chatQueueAddBulk).toHaveBeenCalledOnce()

    const jobs = chatQueueAddBulk.mock.calls[0]?.[0]
    expect(jobs).toHaveLength(2)
    const firstCall = jobs?.[0]
    expect(firstCall?.name).toBe(ChatJobAction.sendFlowMessage)
    expect(firstCall?.opts).toMatchObject({ delay: 0 })
    expect(firstCall?.opts?.jobId).not.toContain(":")
    expect(firstCall?.data.data.richResponse?.executionId).toBe("5")
    const firstPayloads = Object.values(
      firstCall?.data.data.richResponse?.buttonPayloads ?? {},
    )
    expect(firstPayloads).toHaveLength(1)
    expect(firstPayloads[0]?.payload).toEqual({
      type: "send_flow",
      flowId: "12345",
    })

    const secondCall = jobs?.[1]
    expect(secondCall?.opts).toMatchObject({ delay: 4000 })
    expect(secondCall?.opts?.jobId).not.toContain(":")
    const secondPayloads = Object.values(
      secondCall?.data.data.richResponse?.buttonPayloads ?? {},
    )
    expect(secondPayloads).toHaveLength(1)
    expect(secondPayloads[0]?.payload).toMatchObject({
      type: "actions",
      actions: [{ action: "add_tag", tag_name: "lead" }],
    })
  })

  test("stagger messages without explicit delays so quick replies stay last on channel", async () => {
    const result = await sendRichMessages(
      [
        {
          message: {
            text: "Với ngân sách 550k, Serenity Spa gợi ý các liệu trình phù hợp.",
          },
        },
        {
          message: {
            text: "Bạn chọn mục tiêu nào cho liệu trình da của mình?",
            quick_replies: [
              {
                content_type: "text",
                title: "Làm sạch sâu",
                payload: JSON.stringify({
                  actions: [
                    {
                      action: "set_field_value",
                      field_name: "interest",
                      value: "Chăm sóc da chuyên sâu - Làm sạch sâu",
                    },
                    { action: "add_tag", tag_name: "lead" },
                  ],
                }),
              },
            ],
          },
        },
      ],
      ctx,
    )

    expect(result).toEqual({ enqueued: 2, skipped: 0 })
    const jobs = chatQueueAddBulk.mock.calls[0]?.[0]
    expect(jobs?.map((job) => job.opts?.delay)).toEqual([0, 250])
    expect(jobs?.[1]?.data.data.step.buttons).toHaveLength(1)
  })

  test("keeps quick replies with plain payloads instead of omitting them", async () => {
    const result = await sendRichMessages(
      [
        {
          message: {
            text: "Dạ áo bên mình có các size: S, M, L, XL. Bạn muốn xem size nào ạ?",
            quick_replies: [
              {
                content_type: "text",
                title: "S",
                payload: "size_s",
              },
              {
                content_type: "text",
                title: "M",
                payload: "size_m",
              },
              {
                content_type: "text",
                title: "L",
                payload: "size_l",
              },
              {
                content_type: "text",
                title: "XL",
                payload: "size_xl",
              },
            ],
          },
        },
      ],
      ctx,
    )

    expect(result).toEqual({ enqueued: 1, skipped: 0 })
    expect(chatQueueAddBulk).toHaveBeenCalledOnce()
    const call = chatQueueAddBulk.mock.calls[0]?.[0]?.[0]
    expect(call?.data.data.step.buttons).toHaveLength(4)
    expect(call?.data.data.step.buttons.map((button) => button.label)).toEqual([
      "S",
      "M",
      "L",
      "XL",
    ])
    const payloads = Object.values(
      call?.data.data.richResponse?.buttonPayloads ?? {},
    )
    expect(payloads.map((entry) => entry.payload)).toEqual([
      { type: "text", text: "size_s" },
      { type: "text", text: "size_m" },
      { type: "text", text: "size_l" },
      { type: "text", text: "size_xl" },
    ])
    expect(loggerWarnMock).not.toHaveBeenCalledWith(
      expect.any(Object),
      "[rich-response] omitted unsupported button payload",
    )
  })

  test("skips native WhatsApp rich item without enqueueing jobs", async () => {
    const result = await sendRichMessages(
      [
        {
          messaging_product: "whatsapp",
          type: "interactive",
          interactive: {
            type: "button",
          },
        },
      ],
      ctx,
    )

    expect(result).toEqual({ enqueued: 0, skipped: 1 })
    expect(chatQueueAddBulk).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: "whatsapp_native",
        reason: "unsupported_phase_1",
      }),
      "[rich-response] skipped native WhatsApp message",
    )
  })
})

// ---------------------------------------------------------------------------
// executeRichActions
// ---------------------------------------------------------------------------

describe("executeRichActions", () => {
  beforeEach(() => {
    attachTagsByNamesMock.mockClear()
    detachTagsByNamesMock.mockClear()
    setRichSystemFieldByKeyMock.mockClear()
    unsetRichSystemFieldByKeyMock.mockClear()
    setValueByKeyMock.mockClear()
    deleteByKeyMock.mockClear()
    flowExistsMock.mockClear().mockResolvedValue(true)
    integrationQueueAdd.mockClear()
    findByWorkspaceIdAndUserIdMock
      .mockClear()
      .mockResolvedValue({ userId: "admin-1" })
    updateAssignmentMock.mockClear()
    handoffExecuteMock.mockClear()
  })

  test("add_tag calls attachTagsByNames", async () => {
    const result = await executeRichActions(
      [{ action: "add_tag", tag_name: "vip" }],
      ctx,
    )

    expect(attachTagsByNamesMock).toHaveBeenCalledWith(
      ctx.workspaceId,
      ctx.contactId,
      ["vip"],
    )
    expect(result.executed).toBe(1)
    expect(result.failed).toHaveLength(0)
  })

  test("remove_tag calls detachTagsByNames", async () => {
    const result = await executeRichActions(
      [{ action: "remove_tag", tag_name: "prospect" }],
      ctx,
    )

    expect(detachTagsByNamesMock).toHaveBeenCalledWith(
      ctx.workspaceId,
      ctx.contactId,
      ["prospect"],
    )
    expect(result.executed).toBe(1)
  })

  test("set_field_value routes system fields to contactService", async () => {
    await executeRichActions(
      [
        {
          action: "set_field_value",
          field_name: "email",
          value: "foo@bar.com",
        },
      ],
      ctx,
    )

    expect(setRichSystemFieldByKeyMock).toHaveBeenCalledWith({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactId,
      fieldName: "email",
      value: "foo@bar.com",
    })
    expect(setValueByKeyMock).not.toHaveBeenCalled()
  })

  test("set_field_value routes custom fields to contactCustomFieldService", async () => {
    await executeRichActions(
      [{ action: "set_field_value", field_name: "score", value: "89" }],
      ctx,
    )

    expect(setValueByKeyMock).toHaveBeenCalledWith({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactId,
      keyword: "score",
      value: "89",
    })
    expect(setRichSystemFieldByKeyMock).not.toHaveBeenCalled()
  })

  test("unset_field_value routes system fields to contactService", async () => {
    await executeRichActions(
      [{ action: "unset_field_value", field_name: "phone" }],
      ctx,
    )

    expect(unsetRichSystemFieldByKeyMock).toHaveBeenCalledWith({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactId,
      fieldName: "phone",
    })
  })

  test("unset_field_value routes custom fields to contactCustomFieldService", async () => {
    await executeRichActions(
      [{ action: "unset_field_value", field_name: "score" }],
      ctx,
    )

    expect(deleteByKeyMock).toHaveBeenCalledWith({
      workspaceId: ctx.workspaceId,
      contactId: ctx.contactId,
      keyword: "score",
    })
  })

  test("send_flow enqueues with deterministic jobId", async () => {
    await executeRichActions([{ action: "send_flow", flow_id: "99999" }], ctx)

    expect(integrationQueueAdd).toHaveBeenCalledTimes(1)
    const call = integrationQueueAdd.mock.calls[0]
    expect(call[0]).toBe(IntegrationJobAction.sendFlow)
    expect(call[2]?.jobId).toBe(
      `rich-response-${ctx.conversationId}-${ctx.executionId}-send-flow-99999`,
    )
  })

  test("send_flow throws when flow not found", async () => {
    flowExistsMock.mockResolvedValue(false)

    const result = await executeRichActions(
      [{ action: "send_flow", flow_id: "missing-flow" }],
      ctx,
    )

    expect(integrationQueueAdd).not.toHaveBeenCalled()
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.action).toBe("send_flow")
  })

  test("critical failure (send_flow) stops remaining actions", async () => {
    flowExistsMock.mockResolvedValue(false)

    const result = await executeRichActions(
      [
        { action: "send_flow", flow_id: "bad-flow" },
        { action: "add_tag", tag_name: "should-not-run" },
      ],
      ctx,
    )

    expect(attachTagsByNamesMock).not.toHaveBeenCalled()
    expect(result.executed).toBe(0)
    expect(result.failed).toHaveLength(1)
  })

  test("non-critical failure (add_tag) continues to next action", async () => {
    attachTagsByNamesMock.mockRejectedValueOnce(new Error("tag error"))

    const result = await executeRichActions(
      [
        { action: "add_tag", tag_name: "fail-tag" },
        { action: "remove_tag", tag_name: "ok-tag" },
      ],
      ctx,
    )

    expect(detachTagsByNamesMock).toHaveBeenCalled()
    expect(result.failed).toHaveLength(1)
    expect(result.executed).toBe(1)
  })

  test("assign_conversation verifies workspace member and calls updateAssignment", async () => {
    await executeRichActions(
      [{ action: "assign_conversation", admin_id: "admin-1" }],
      ctx,
    )

    expect(findByWorkspaceIdAndUserIdMock).toHaveBeenCalledWith({
      workspaceId: ctx.workspaceId,
      userId: "admin-1",
    })
    expect(updateAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ctx.workspaceId,
        assignedUserId: "admin-1",
        assignedInboxTeamId: null,
      }),
    )
  })

  test("assign_conversation throws when admin not in workspace", async () => {
    findByWorkspaceIdAndUserIdMock.mockResolvedValue(undefined)

    const result = await executeRichActions(
      [{ action: "assign_conversation", admin_id: "admin-1" }],
      ctx,
    )

    expect(updateAssignmentMock).not.toHaveBeenCalled()
    expect(result.failed).toHaveLength(1)
  })

  test("unassign_conversation calls updateAssignment with null userId", async () => {
    await executeRichActions([{ action: "unassign_conversation" }], ctx)

    expect(updateAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedUserId: null,
        assignedInboxTeamId: null,
      }),
    )
  })

  test("transfer_conversation_to calls handoffExecutorService", async () => {
    await executeRichActions(
      [{ action: "transfer_conversation_to", value: "human" }],
      ctx,
    )

    expect(handoffExecuteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        reason: "user_requested_human",
        source: "ai_system_tool",
      }),
    )
  })

  test("critical failure (transfer_conversation_to) stops remaining actions", async () => {
    handoffExecuteMock.mockRejectedValueOnce(new Error("handoff failed"))

    const result = await executeRichActions(
      [
        { action: "transfer_conversation_to", value: "human" },
        { action: "add_tag", tag_name: "should-not-run" },
      ],
      ctx,
    )

    expect(attachTagsByNamesMock).not.toHaveBeenCalled()
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.action).toBe("transfer_conversation_to")
  })
})
