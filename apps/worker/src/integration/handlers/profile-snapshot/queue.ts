import {
  ProfileSnapshotJobAction,
  profileSnapshotJobId,
  profileSnapshotQueue,
} from "@chatbotx.io/worker-config"

export const enqueueProfileSnapshotJobs = async (input: {
  contactInboxIds: Iterable<string>
  inboxId: string
  workspaceId: string
}): Promise<void> => {
  const ids = [...new Set(input.contactInboxIds)]
  if (ids.length === 0) {
    return
  }
  await profileSnapshotQueue.addBulk(
    ids.map((contactInboxId) => ({
      name: ProfileSnapshotJobAction.capture,
      data: {
        type: ProfileSnapshotJobAction.capture,
        data: {
          contactInboxId,
          inboxId: input.inboxId,
          workspaceId: input.workspaceId,
        },
      },
      opts: {
        attempts: 1,
        jobId: profileSnapshotJobId(contactInboxId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    })),
  )
}
