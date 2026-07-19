import { isWebhookContext } from "@chatbotx.io/events/context"
import {
  IntegrationJobAction,
  type IntegrationJobData,
} from "@chatbotx.io/worker-config"
import { describe, expect, test, vi } from "vitest"
import { isChannelOriginatedJob } from "../src/integration/channel-origin"
import { runIntegrationJobWithWebhookContext } from "../src/integration/job-context"

describe("isChannelOriginatedJob", () => {
  test("allows known channel-originated job types", () => {
    const jobData = {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        ref: "ref-1",
      },
    } satisfies IntegrationJobData

    expect(isChannelOriginatedJob(jobData)).toBe(true)
  })

  test("keeps questionnaire challenge replies in webhook context", () => {
    const jobData = {
      type: IntegrationJobAction.runChallenge,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        messageId: "message-1",
        messageCreatedAt: new Date("2026-01-02T00:00:00Z"),
        challenge: {
          type: "step",
          data: {
            flowId: "flow-1",
            flowVersionId: "flow-version-1",
            nodeId: "node-1",
            stepId: "step-1",
            attempts: 0,
            lastAttemptAt: new Date("2026-01-02T00:00:00Z"),
          },
        },
      },
    } satisfies IntegrationJobData

    expect(isChannelOriginatedJob(jobData)).toBe(true)
  })

  test("allows sendFlow only when origin is channel", () => {
    const channelFlowJob = {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        origin: "channel",
      },
    } satisfies IntegrationJobData
    const scheduledFlowJob = {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      },
    } satisfies IntegrationJobData

    expect(isChannelOriginatedJob(channelFlowJob)).toBe(true)
    expect(isChannelOriginatedJob(scheduledFlowJob)).toBe(false)
  })

  test("rejects non-channel job types", () => {
    const jobData = {
      type: IntegrationJobAction.sendSequenceFlow,
      data: {
        dispatchId: "dispatch-1",
        workspaceId: "workspace-1",
        stepId: "step-1",
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        enrollmentId: "enrollment-1",
        sequenceId: "sequence-1",
        bucket: 0,
        metadata: {},
      },
    } satisfies IntegrationJobData

    expect(isChannelOriginatedJob(jobData)).toBe(false)
  })

  test("runs channel jobs inside webhook context and non-channel jobs outside it", async () => {
    const channelFlowJob = {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        origin: "channel",
      },
    } satisfies IntegrationJobData
    const scheduledFlowJob = {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      },
    } satisfies IntegrationJobData

    await vi.waitFor(async () => {
      await expect(
        runIntegrationJobWithWebhookContext(channelFlowJob, async () =>
          isWebhookContext(),
        ),
      ).resolves.toBe(true)
    })
    await expect(
      runIntegrationJobWithWebhookContext(scheduledFlowJob, async () =>
        isWebhookContext(),
      ),
    ).resolves.toBe(false)
  })
})
