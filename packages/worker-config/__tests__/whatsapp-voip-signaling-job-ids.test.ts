import { describe, expect, test } from "vitest"
import {
  expireOutboundDialJobId,
  outboundAnswerJobId,
  WhatsappVoipSignalingJobAction,
  type WhatsappVoipSignalingJobData,
  whatsappVoipExpiryJobId,
  whatsappVoipSignalingJobId,
} from "../src/queues/whatsapp-voip-signaling"

describe("WhatsappVoipSignalingJobAction", () => {
  test("registers the outbound (business-initiated) job actions", () => {
    expect(WhatsappVoipSignalingJobAction.handleOutboundAnswer).toBe(
      "handleOutboundAnswer",
    )
    expect(WhatsappVoipSignalingJobAction.expireOutboundDial).toBe(
      "expireOutboundDial",
    )
  })

  test("keeps the existing inbound job actions unchanged", () => {
    expect(WhatsappVoipSignalingJobAction.handleConnect).toBe("handleConnect")
    expect(WhatsappVoipSignalingJobAction.expireIfUnanswered).toBe(
      "expireIfUnanswered",
    )
  })
})

describe("outbound job payload shapes", () => {
  test("handleOutboundAnswer payload never carries an sdp field", () => {
    const payload: WhatsappVoipSignalingJobData = {
      type: WhatsappVoipSignalingJobAction.handleOutboundAnswer,
      data: {
        attemptId: "attempt-1",
        whatsappCallId: "call-1",
        wacid: "wamid.ABC",
        workspaceId: "ws-1",
      },
    }

    expect(payload.data).not.toHaveProperty("sdp")
    expect(payload.data).not.toHaveProperty("session")
  })

  test("handleOutboundAnswer payload allows an absent wacid (answer/connect race)", () => {
    const payload: WhatsappVoipSignalingJobData = {
      type: WhatsappVoipSignalingJobAction.handleOutboundAnswer,
      data: {
        attemptId: "attempt-1",
        whatsappCallId: "call-1",
        workspaceId: "ws-1",
      },
    }

    expect(payload.data.wacid).toBeUndefined()
  })

  test("expireOutboundDial payload never carries an sdp field", () => {
    const payload: WhatsappVoipSignalingJobData = {
      type: WhatsappVoipSignalingJobAction.expireOutboundDial,
      data: {
        attemptId: "attempt-1",
        whatsappCallId: "call-1",
        workspaceId: "ws-1",
        deadlineAt: 1_700_000_000_000,
      },
    }

    expect(payload.data).not.toHaveProperty("sdp")
  })
})

describe("outbound job id helpers", () => {
  test("outboundAnswerJobId is stable and keyed by attemptId", () => {
    expect(outboundAnswerJobId("attempt-1")).toBe("voip-out-answer-attempt-1")
    expect(outboundAnswerJobId("attempt-1")).toBe(
      outboundAnswerJobId("attempt-1"),
    )
    expect(outboundAnswerJobId("attempt-1")).not.toBe(
      outboundAnswerJobId("attempt-2"),
    )
  })

  test("expireOutboundDialJobId is stable and keyed by attemptId", () => {
    expect(expireOutboundDialJobId("attempt-1")).toBe(
      "voip-out-expire-attempt-1",
    )
    expect(expireOutboundDialJobId("attempt-1")).toBe(
      expireOutboundDialJobId("attempt-1"),
    )
  })

  test("outbound job ids never collide with the existing inbound job ids", () => {
    expect(outboundAnswerJobId("wacid-1")).not.toBe(
      whatsappVoipSignalingJobId("wacid-1"),
    )
    expect(expireOutboundDialJobId("wacid-1")).not.toBe(
      whatsappVoipExpiryJobId("wacid-1"),
    )
  })
})
