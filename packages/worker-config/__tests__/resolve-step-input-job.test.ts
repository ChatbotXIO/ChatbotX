import { describe, expect, test } from "vitest"
import {
  buildResolveStepInputJob,
  IntegrationJobAction,
} from "../src/queues/integration"

const skipTap = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  challengeId: "11612473309626368",
  reason: "user_skipped" as const,
  messageId: "msg-1",
  messageCreatedAt: new Date("2026-11-09T10:00:00.000Z"),
}

describe("buildResolveStepInputJob", () => {
  test("names the job and carries the payload unchanged", () => {
    const job = buildResolveStepInputJob(skipTap)

    expect(job.name).toBe(IntegrationJobAction.resolveStepInput)
    expect(job.data).toEqual({
      type: IntegrationJobAction.resolveStepInput,
      data: skipTap,
    })
  })

  test("a message-less resolution carries no message identity", () => {
    const { messageId: _id, messageCreatedAt: _at, ...withoutMessage } = skipTap

    const job = buildResolveStepInputJob(withoutMessage)

    expect(job.data.data).not.toHaveProperty("messageId")
  })

  test("collapses duplicates per conversation and challenge, only while a job is active", () => {
    const first = buildResolveStepInputJob(skipTap)
    const sameChallenge = buildResolveStepInputJob({
      ...skipTap,
      messageId: "msg-2",
    })
    const otherChallenge = buildResolveStepInputJob({
      ...skipTap,
      challengeId: "11612473309626369",
    })
    const otherConversation = buildResolveStepInputJob({
      ...skipTap,
      conversationId: "conv-2",
    })

    expect(first.opts.deduplication?.id).toBe(
      "step-input-conv-1-11612473309626368",
    )
    expect(sameChallenge.opts.deduplication?.id).toBe(
      first.opts.deduplication?.id,
    )
    expect(otherChallenge.opts.deduplication?.id).not.toBe(
      first.opts.deduplication?.id,
    )
    expect(otherConversation.opts.deduplication?.id).not.toBe(
      first.opts.deduplication?.id,
    )
  })

  test("never uses a fixed jobId: a retained completed job would drop a later tap", () => {
    expect(buildResolveStepInputJob(skipTap).opts).not.toHaveProperty("jobId")
  })
})
