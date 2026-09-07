import { describe, expect, test } from "vitest"
import { AIJobAction, aiJobDataSchema } from "../src/queues/ai-agent"

const automatedResponseJob = {
  type: AIJobAction.processAutomatedResponse,
  data: {
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    messageId: "message-1",
  },
}

const commentAIReplyJob = {
  type: AIJobAction.commentAIReply,
  data: {
    automationId: "automation-1",
    integrationType: "messenger",
    integrationIdentifier: "page-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    commentId: "comment-1",
    agentId: "agent-1",
    replyChannel: "public",
    channelType: "messenger",
    message: "hello",
  },
}

const storyReplyJob = {
  type: AIJobAction.processStoryReplyAutomation,
  data: {
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    messageId: "message-1",
    storyId: "story-1",
    channelType: "instagram",
  },
}

describe("aiJobDataSchema Phase 1 reply jobs", () => {
  test.each([
    automatedResponseJob,
    commentAIReplyJob,
    storyReplyJob,
  ])("parses $type payloads", (jobData) => {
    expect(aiJobDataSchema.parse(jobData)).toEqual(jobData)
  })

  test("rejects model-shaped identifiers at the Redis boundary", () => {
    expect(
      aiJobDataSchema.safeParse({
        ...automatedResponseJob,
        data: {
          ...automatedResponseJob.data,
          conversationId: { id: "conversation-1" },
        },
      }).success,
    ).toBe(false)
  })

  test("rejects a new comment AI reply without automationId", () => {
    const { automationId: _automationId, ...legacyData } =
      commentAIReplyJob.data

    expect(
      aiJobDataSchema.safeParse({
        type: AIJobAction.commentAIReply,
        data: legacyData,
      }).success,
    ).toBe(false)
  })

  test("rejects malformed story reply channels", () => {
    expect(
      aiJobDataSchema.safeParse({
        ...storyReplyJob,
        data: { ...storyReplyJob.data, channelType: "messenger" },
      }).success,
    ).toBe(false)
  })
})
