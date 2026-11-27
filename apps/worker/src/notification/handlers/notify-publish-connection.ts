import {
  hasWorkspacePermission,
  publishDestinationService,
  socialAccountService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { NotificationJobNotifyPublishConnection } from "@chatbotx.io/worker-config"
import { deliverPushToUsers } from "../lib/deliver-push"
import { getExpoClient } from "../lib/expo"
import { t } from "../lib/strings"

type ConnectionSnapshot = {
  /** Whether the connection is still in the state the push is about. */
  stillApplies: boolean
  name: string
}

type Job = NotificationJobNotifyPublishConnection

/** The members who turned the push on AND may open the Posts page (`broadcast`; super admins have every permission). */
const resolveRecipientUserIds = async (
  workspaceId: string,
): Promise<string[]> => {
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return members
    .filter(
      (member) =>
        member.notificationTypes?.publishConnection === true &&
        hasWorkspacePermission(member.permissions ?? {}, "broadcast"),
    )
    .map((member) => member.userId)
}

const orNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read()
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

const readDestination = async (
  job: Job,
  publishDestinationId: string,
): Promise<ConnectionSnapshot | null> => {
  const destination = await orNull(() =>
    publishDestinationService.get({
      id: publishDestinationId,
      workspaceId: job.data.workspaceId,
    }),
  )
  if (!destination) {
    return null
  }
  const name = destination.name ?? destination.username ?? ""
  if (job.data.alert === "paused") {
    return {
      name,
      stillApplies:
        destination.pausedUntil !== null &&
        destination.pausedUntil.getTime() > Date.now(),
    }
  }
  const state =
    job.data.alert === "permissionMissing"
      ? "permissionMissing"
      : "needsReconnect"
  return { name, stillApplies: destination.state === state }
}

const readSocialAccount = async (
  job: Job,
  socialAccountId: string,
): Promise<ConnectionSnapshot | null> => {
  const account = await orNull(() =>
    socialAccountService.get({
      id: socialAccountId,
      workspaceId: job.data.workspaceId,
    }),
  )
  return account
    ? {
        name: account.displayName,
        stillApplies: account.status === "needsReauth",
      }
    : null
}

const readConnection = async (job: Job): Promise<ConnectionSnapshot | null> => {
  const { publishDestinationId, socialAccountId } = job.data
  if (publishDestinationId) {
    return await readDestination(job, publishDestinationId)
  }
  return socialAccountId ? await readSocialAccount(job, socialAccountId) : null
}

const titleOf = (
  strings: ReturnType<typeof t>,
  alert: Job["data"]["alert"],
): string => {
  if (alert === "permissionMissing") {
    return strings.publishPermissionMissing
  }
  return alert === "paused"
    ? strings.publishPaused
    : strings.publishNeedsReconnect
}

/**
 * Pushes "a publishing connection needs attention" (token rejected or expired,
 * permission missing, paused by the network's limits) to the members who want
 * it. Skipped when the connection recovered (reconnected, pause over) before
 * the job ran. The job id is per connection, alert and transition.
 */
export const notifyPublishConnection = async (job: Job): Promise<void> => {
  const expo = getExpoClient()
  if (!expo) {
    return
  }
  const { workspaceId } = job.data
  const connection = await readConnection(job)
  if (!connection?.stillApplies) {
    return
  }
  await deliverPushToUsers({
    expo,
    userIds: await resolveRecipientUserIds(workspaceId),
    content: async () => {
      const workspace = await workspaceService.find({
        where: { id: workspaceId },
      })
      return {
        title: titleOf(t(workspace?.language), job.data.alert),
        body: connection.name,
        data: {
          alert: job.data.alert,
          workspaceId,
          ...(job.data.publishDestinationId
            ? { publishDestinationId: job.data.publishDestinationId }
            : {}),
          ...(job.data.socialAccountId
            ? { socialAccountId: job.data.socialAccountId }
            : {}),
        },
      }
    },
  })
}
