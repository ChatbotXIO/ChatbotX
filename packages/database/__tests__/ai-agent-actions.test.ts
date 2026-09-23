import {
  aiAgentActionRulesSchema,
  aiAgentActionSchema,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"

const actionIds = [
  "send_flow",
  "assign_conversation",
  "remove_assignment",
  "transfer_to_human",
  "add_tag",
  "remove_tag",
  "set_custom_field",
  "clear_custom_field",
  "mark_follow_up",
  "remove_follow_up",
  "transfer_to_bot",
  "archive",
  "block_contact",
] as const

const actionByType = (type: (typeof actionIds)[number]) => {
  switch (type) {
    case "send_flow":
      return { id: type, type, flowId: "flow-1" }
    case "assign_conversation":
      return { id: type, type, assignedId: "u_user-1" }
    case "add_tag":
    case "remove_tag":
      return { id: type, type, tagId: "tag-1" }
    case "set_custom_field":
    case "clear_custom_field":
      return { id: type, type, customFieldId: "field-1" }
    default:
      return { id: type, type }
  }
}

describe("AI agent action contract", () => {
  test("accepts every configured action variant", () => {
    for (const type of actionIds) {
      expect(aiAgentActionSchema.safeParse(actionByType(type)).success).toBe(
        true,
      )
    }
  })

  test("rejects duplicate stable IDs and empty rules", () => {
    expect(
      aiAgentActionRulesSchema.safeParse([
        { id: "rule", when: "", actions: [actionByType("archive")] },
      ]).success,
    ).toBe(false)
    expect(
      aiAgentActionRulesSchema.safeParse([
        { id: "rule", when: "matches", actions: [actionByType("archive")] },
        { id: "rule", when: "other", actions: [actionByType("block_contact")] },
      ]).success,
    ).toBe(false)
  })

  test("rejects unknown discriminator and excess rules", () => {
    expect(
      aiAgentActionSchema.safeParse({ id: "x", type: "delete_everything" })
        .success,
    ).toBe(false)
    expect(
      aiAgentActionRulesSchema.safeParse(
        Array.from({ length: 21 }, (_, index) => ({
          id: `rule-${index}`,
          when: "matches",
          actions: [actionByType("archive")],
        })),
      ).success,
    ).toBe(false)
  })

  test("accepts Inbox Team and legacy administrator assignment targets", () => {
    expect(
      aiAgentActionSchema.safeParse({
        id: "team-assignment",
        type: "assign_conversation",
        assignedId: "t_team-1",
      }).success,
    ).toBe(true)
    expect(
      aiAgentActionSchema.safeParse({
        id: "legacy-admin-assignment",
        type: "assign_conversation",
        adminId: "user-1",
      }).success,
    ).toBe(true)
  })
})
