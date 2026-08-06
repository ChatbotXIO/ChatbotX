import { describe, expect, test } from "vitest"
import {
  decodeTemplateFlowToken,
  encodeTemplateFlowToken,
  isTemplateFlowToken,
  TemplateFlowOrigin,
} from "../src/steps/wa-template-flow-token"
import { decodeButtonPayload, encodeButtonPayload } from "../src/util"

describe("WhatsApp template FLOW token", () => {
  test("round-trips broadcast origin", () => {
    const encoded = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 1,
    })

    expect(decodeTemplateFlowToken(encoded)).toEqual({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626368",
      buttonIndex: 1,
    })
  })

  test("round-trips flow-step origin with version and carousel card", () => {
    const encoded = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626370",
      buttonIndex: 0,
      cardIndex: 2,
    })

    expect(decodeTemplateFlowToken(encoded)).toEqual({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626370",
      buttonIndex: 0,
      cardIndex: 2,
    })
  })

  test("rejects malformed or truncated tokens", () => {
    expect(decodeTemplateFlowToken("")).toBeNull()
    expect(decodeTemplateFlowToken("watf:b")).toBeNull()
    expect(decodeTemplateFlowToken("watf:s:1::2")).toBeNull()
    expect(decodeTemplateFlowToken("watf:b:not-a-bigint:0")).toBeNull()
    expect(decodeTemplateFlowToken("watf:b:9999999999999999999:0")).toBeNull()
  })

  test("rejects tokens with trailing segments", () => {
    expect(
      decodeTemplateFlowToken("watf:b:11612473309626368:0::extra"),
    ).toBeNull()
    expect(
      decodeTemplateFlowToken(
        "watf:s:11612473309626368:11612473309626369:11612473309626370:0::extra",
      ),
    ).toBeNull()
  })

  test("rejects empty index segments", () => {
    expect(decodeTemplateFlowToken("watf:b:11612473309626368:")).toBeNull()
    expect(
      decodeTemplateFlowToken(
        "watf:s:11612473309626368:11612473309626369:11612473309626370:",
      ),
    ).toBeNull()
  })

  test("does not collide with existing button payload tokens", () => {
    const buttonPayload = encodeButtonPayload({
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      buttonId: "11612473309626370",
    })
    const templatePayload = encodeTemplateFlowToken({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626371",
      buttonIndex: 0,
    })

    expect(isTemplateFlowToken(buttonPayload)).toBe(false)
    expect(decodeTemplateFlowToken(buttonPayload)).toBeNull()
    expect(decodeButtonPayload(templatePayload)).toBeNull()
  })
})
