import {
  InstagramSnapshotJobAction,
  instagramSnapshotJobId,
  instagramSnapshotQueue,
} from "@chatbotx.io/worker-config"

export const enqueueInstagramSnapshotJobs = async (input: {
  contactInboxIds: Iterable<string>
  inboxId: string
  workspaceId: string
}): Promise<void> => {
  const ids = [...new Set(input.contactInboxIds)]
  if (ids.length === 0) {
    return
  }
  await instagramSnapshotQueue.addBulk(
    ids.map((contactInboxId) => ({
      name: InstagramSnapshotJobAction.capture,
      data: {
        type: InstagramSnapshotJobAction.capture,
        data: {
          contactInboxId,
          inboxId: input.inboxId,
          workspaceId: input.workspaceId,
        },
      },
      opts: {
        attempts: 1,
        jobId: instagramSnapshotJobId(contactInboxId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    })),
  )
}
