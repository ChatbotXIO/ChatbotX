import type { PipelineActorKind } from "@chatbotx.io/database/partials"
import {
  CogIcon,
  KeyRoundIcon,
  type LucideIcon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react"
import type { PipelineMessageKey } from "./message-key"

/** Shown for a member whose name is unavailable (same as `workspaceMemberLabel`). */
export const UNKNOWN_MEMBER_LABEL = "--"

/** Label and icon for actors that are not a workspace member. */
export const AUTOMATION_ACTORS = {
  flow: { labelKey: "activityActor.flow", Icon: WorkflowIcon },
  trigger: { labelKey: "activityActor.trigger", Icon: ZapIcon },
  workspaceToken: {
    labelKey: "activityActor.workspaceToken",
    Icon: KeyRoundIcon,
  },
  system: { labelKey: "activityActor.system", Icon: CogIcon },
} as const satisfies Record<
  Exclude<PipelineActorKind, "user">,
  { labelKey: PipelineMessageKey; Icon: LucideIcon }
>

/**
 * Who an activity row was done by: the member's name, a user id that is no
 * longer a member as "former member", or the automation that acted.
 */
export function activityActorLabel(
  entry: { actorKind: PipelineActorKind; actorUserId: string | null },
  memberNames: ReadonlyMap<string, string> | undefined,
  t: (key: PipelineMessageKey) => string,
): string {
  if (entry.actorKind !== "user") {
    return t(AUTOMATION_ACTORS[entry.actorKind].labelKey)
  }
  return (
    (entry.actorUserId && memberNames?.get(entry.actorUserId)) ??
    t("activityActor.formerMember")
  )
}
