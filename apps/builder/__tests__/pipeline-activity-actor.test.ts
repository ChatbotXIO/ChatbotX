import { pipelineActorKinds } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  AUTOMATION_ACTORS,
  activityActorLabel,
} from "../src/features/pipelines/lib/activity-actor"

const t = (key: string) => `t:${key}`
const members = new Map([
  ["10", "Ann Lee"],
  // An unnamed member keeps the shared "--" label, not "former member".
  ["11", "--"],
])

describe("activityActorLabel", () => {
  test("a member reads by name", () => {
    expect(
      activityActorLabel({ actorKind: "user", actorUserId: "10" }, members, t),
    ).toBe("Ann Lee")
  })

  test("an unnamed current member is not called a former member", () => {
    expect(
      activityActorLabel({ actorKind: "user", actorUserId: "11" }, members, t),
    ).toBe("--")
  })

  test.each([
    ["a user who left the workspace", "99"],
    ["a deleted user", null],
  ])("%s reads as a former member", (_, actorUserId) => {
    expect(
      activityActorLabel({ actorKind: "user", actorUserId }, members, t),
    ).toBe("t:activityActor.formerMember")
  })

  test("every non-member actor kind has its own label", () => {
    const automation = pipelineActorKinds.options.filter(
      (kind) => kind !== "user",
    )
    expect(Object.keys(AUTOMATION_ACTORS).sort()).toEqual(
      [...automation].sort(),
    )
    for (const actorKind of automation) {
      expect(
        activityActorLabel({ actorKind, actorUserId: null }, members, t),
      ).toBe(`t:${AUTOMATION_ACTORS[actorKind].labelKey}`)
    }
  })

  test("automation is labelled even before member names load", () => {
    expect(
      activityActorLabel(
        { actorKind: "flow", actorUserId: null },
        undefined,
        t,
      ),
    ).toBe("t:activityActor.flow")
  })
})
