import {
  hasWorkspacePermission,
  socialPostService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceMemberNotificationTypes } from "@chatbotx.io/database/partials"
import {
  NotificationJobAction,
  type NotificationJobPost,
} from "@chatbotx.io/worker-config"
import { deliverPushToUsers } from "../lib/deliver-push"
import { getExpoClient } from "../lib/expo"
import { t } from "../lib/strings"

/** The member setting and the target status each post push is about. */
const POST_PUSH = {
  [NotificationJobAction.notifyPostFailed]: {
    setting: "postFailed",
    status: "failed",
  },
  [NotificationJobAction.notifyPostNeedsReview]: {
    setting: "postNeedsReview",
    status: "needsReview",
  },
} as const satisfies Record<
  NotificationJobPost["type"],
  {
    setting: keyof WorkspaceMemberNotificationTypes
    status: "failed" | "needsReview"
  }
>

const MAX_BODY_LENGTH = 140

/**
 * The members who turned the push on AND may open the Posts page (`broadcast`;
 * super admins have every permission). A row stored before the setting existed
 * has no key for it, which counts as off.
 */
const resolvePostRecipientUserIds = async (
  workspaceId: string,
  setting: keyof WorkspaceMemberNotificationTypes,
): Promise<string[]> => {
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return members
    .filter(
      (member) =>
        member.notificationTypes?.[setting] === true &&
        hasWorkspacePermission(member.permissions ?? {}, "broadcast"),
    )
    .map((member) => member.userId)
}

/** A post deleted before its push went out has nothing to announce. */
const findPost = async (input: { id: string; workspaceId: string }) => {
  try {
    return await socialPostService.get(input)
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

const truncate = (text: string): string =>
  text.length > MAX_BODY_LENGTH
    ? `${text.slice(0, MAX_BODY_LENGTH - 1)}…`
    : text

/**
 * Pushes "Post failed to publish" / "A post needs your review" to the members
 * who want it. Skipped when the target has moved on (retried or resolved)
 * before the job ran. The job id is per target and attempt.
 */
export const notifyPostTarget = async (
  job: NotificationJobPost,
): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }
  const { workspaceId, socialPostId, targetId } = job.data
  const push = POST_PUSH[job.type]
  const post = await findPost({ id: socialPostId, workspaceId })
  const target = post?.targets.find((candidate) => candidate.id === targetId)
  if (!target || target.status !== push.status) {
    return
  }

  await deliverPushToUsers({
    expo,
    userIds: await resolvePostRecipientUserIds(workspaceId, push.setting),
    content: async () => {
      const workspace = await workspaceService.find({
        where: { id: workspaceId },
      })
      const strings = t(workspace?.language)
      return {
        title:
          job.type === NotificationJobAction.notifyPostFailed
            ? strings.postFailed
            : strings.postNeedsReview,
        body: truncate(
          [target.destination.name, target.errorMessage]
            .filter(Boolean)
            .join(" · "),
        ),
        data: { workspaceId, socialPostId, targetId },
      }
    },
  })
}
