import { describe, expect, test } from "vitest"
import {
  CALL_ELIGIBILITY_RULES,
  isEligibleForConversationCall,
  MAX_VOIP_RING_TARGETS,
  RING_TIERS,
  type RingContext,
  selectRingTargets,
} from "../src/whatsapp-call/ring-targets"

const baseContext = (overrides: Partial<RingContext> = {}): RingContext => ({
  conversation: null,
  onlineUserIds: [],
  permissionsByUserId: new Map(),
  teamMemberUserIds: [],
  ...overrides,
})

describe("isEligibleForConversationCall", () => {
  test("superAdmin is always eligible, any conversation", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { superAdmin: true } },
        null,
      ),
    ).toBe(true)
  })

  test("contacts permission is always eligible, any conversation", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { contacts: true } },
        { assignedUserId: "someone-else", assignedInboxTeamId: null },
      ),
    ).toBe(true)
  })

  test("onlyAssignedContacts is eligible ONLY when individually assigned to them", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { onlyAssignedContacts: true } },
        { assignedUserId: "u1", assignedInboxTeamId: null },
      ),
    ).toBe(true)
  })

  test("onlyAssignedContacts is NOT eligible when assigned to someone else", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { onlyAssignedContacts: true } },
        { assignedUserId: "u2", assignedInboxTeamId: null },
      ),
    ).toBe(false)
  })

  test("onlyAssignedContacts is NOT eligible for an unassigned conversation (no auto-claim)", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { onlyAssignedContacts: true } },
        { assignedUserId: null, assignedInboxTeamId: null },
      ),
    ).toBe(false)
  })

  test("onlyAssignedContacts is NOT eligible for a team-assigned-but-not-individually-assigned conversation", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { onlyAssignedContacts: true } },
        { assignedUserId: null, assignedInboxTeamId: "team-1" },
      ),
    ).toBe(false)
  })

  test("no qualifying permission at all is NOT eligible", () => {
    expect(
      isEligibleForConversationCall(
        { userId: "u1", permissions: { analytics: true, flows: true } },
        null,
      ),
    ).toBe(false)
  })

  test("empty permissions object is NOT eligible", () => {
    expect(
      isEligibleForConversationCall({ userId: "u1", permissions: {} }, null),
    ).toBe(false)
  })

  test("CALL_ELIGIBILITY_RULES has exactly the three documented rules", () => {
    expect(CALL_ELIGIBILITY_RULES).toHaveLength(3)
  })
})

describe("selectRingTargets — tier matrix", () => {
  test("assignee online and eligible: tier 1 wins", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: {
          assignedUserId: "assignee-1",
          assignedInboxTeamId: null,
        },
        onlineUserIds: ["assignee-1", "other-1"],
        permissionsByUserId: new Map([
          ["assignee-1", { contacts: true }],
          ["other-1", { contacts: true }],
        ]),
      }),
    )
    expect(result).toEqual({ tier: "assignee", userIds: ["assignee-1"] })
  })

  test("assignee online but ineligible: falls through past tier 1 (not auto-included)", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: {
          assignedUserId: "assignee-1",
          assignedInboxTeamId: null,
        },
        onlineUserIds: ["assignee-1", "other-1"],
        permissionsByUserId: new Map([
          ["assignee-1", { analytics: true }], // ineligible
          ["other-1", { contacts: true }],
        ]),
      }),
    )
    // Falls through tier 2 (no team) straight to tier 3 (eligible online).
    expect(result).toEqual({ tier: "eligibleOnline", userIds: ["other-1"] })
  })

  test("assignee offline falls through to team tier", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: {
          assignedUserId: "assignee-1",
          assignedInboxTeamId: "team-1",
        },
        onlineUserIds: ["team-member-1"],
        permissionsByUserId: new Map([["team-member-1", { contacts: true }]]),
        teamMemberUserIds: ["team-member-1"],
      }),
    )
    expect(result).toEqual({ tier: "assignedTeam", userIds: ["team-member-1"] })
  })

  test("team tier rings online+eligible team members", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: { assignedUserId: null, assignedInboxTeamId: "team-1" },
        onlineUserIds: ["team-member-1", "non-team-1"],
        permissionsByUserId: new Map([
          ["team-member-1", { contacts: true }],
          ["non-team-1", { contacts: true }],
        ]),
        teamMemberUserIds: ["team-member-1"],
      }),
    )
    expect(result).toEqual({ tier: "assignedTeam", userIds: ["team-member-1"] })
  })

  test("team member with only onlyAssignedContacts is skipped in tier 2 (not individually assigned)", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: { assignedUserId: null, assignedInboxTeamId: "team-1" },
        onlineUserIds: ["team-member-1"],
        permissionsByUserId: new Map([
          ["team-member-1", { onlyAssignedContacts: true }],
        ]),
        teamMemberUserIds: ["team-member-1"],
      }),
    )
    // No eligible team member, no other online eligible member -> nobody.
    expect(result).toEqual({ tier: null, userIds: [] })
  })

  test("team empty (no eligible team member online): falls through to eligible online tier", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: { assignedUserId: null, assignedInboxTeamId: "team-1" },
        onlineUserIds: ["other-1"],
        permissionsByUserId: new Map([["other-1", { contacts: true }]]),
        teamMemberUserIds: [],
      }),
    )
    expect(result).toEqual({ tier: "eligibleOnline", userIds: ["other-1"] })
  })

  test("nobody: every tier empty", () => {
    const result = selectRingTargets(
      baseContext({
        conversation: null,
        onlineUserIds: ["u1"],
        permissionsByUserId: new Map([["u1", { analytics: true }]]),
      }),
    )
    expect(result).toEqual({ tier: null, userIds: [] })
  })

  test("online id with no permissions entry at all (e.g. support session) is excluded", () => {
    const result = selectRingTargets(
      baseContext({
        onlineUserIds: ["support-session-user"],
        permissionsByUserId: new Map(),
      }),
    )
    expect(result).toEqual({ tier: null, userIds: [] })
  })

  test("cap applied AFTER eligibility filtering, not before", () => {
    const ineligible = Array.from({ length: 11 }, (_, i) => `ineligible-${i}`)
    const eligible = ["agent-1", "agent-2", "agent-3"]
    const permissionsByUserId = new Map<string, { contacts?: boolean }>()
    for (const id of ineligible) {
      permissionsByUserId.set(id, {})
    }
    for (const id of eligible) {
      permissionsByUserId.set(id, { contacts: true })
    }
    const result = selectRingTargets(
      baseContext({
        onlineUserIds: [...ineligible, ...eligible],
        permissionsByUserId,
      }),
    )
    expect(result).toEqual({ tier: "eligibleOnline", userIds: eligible })
  })

  test("caps the winning tier at MAX_VOIP_RING_TARGETS, preserving presence order", () => {
    const onlineUserIds = Array.from(
      { length: MAX_VOIP_RING_TARGETS + 5 },
      (_, i) => `agent-${i}`,
    )
    const permissionsByUserId = new Map(
      onlineUserIds.map((id) => [id, { contacts: true }]),
    )
    const result = selectRingTargets(
      baseContext({ onlineUserIds, permissionsByUserId }),
    )
    expect(result).toEqual({
      tier: "eligibleOnline",
      userIds: onlineUserIds.slice(0, MAX_VOIP_RING_TARGETS),
    })
  })

  test("RING_TIERS is exactly the three documented tiers, in order", () => {
    expect(RING_TIERS.map((tier) => tier.name)).toEqual([
      "assignee",
      "assignedTeam",
      "eligibleOnline",
    ])
  })
})
