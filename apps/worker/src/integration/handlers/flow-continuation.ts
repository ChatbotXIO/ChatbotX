import {
  flowContinuationJobOptions,
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  integrationQueue,
} from "@chatbotx.io/worker-config"

export type SendFlowJobData = IntegrationJobRunFlowNode["data"]

/** A branch job built by a step but not enqueued yet. */
export type DeferredBranchJob = {
  job: IntegrationJobRunFlowNode
  jobId?: string
}

/**
 * Orders a Get User Data branch before the flow's continuation past it.
 *
 * The continuation the run received (`thenSendFlow`) rides on this node's own
 * first continuation (its next step or next node), or is enqueued when the
 * node's run stops here. A deferred branch gets this node's continuation
 * attached, so it runs once the branch's chain stops. Each piece is enqueued
 * exactly once.
 */
export function createContinuationChain(
  thenSendFlow: SendFlowJobData | undefined,
) {
  let isThenHandedOff = thenSendFlow === undefined
  let deferredBranch: DeferredBranchJob | undefined

  const enqueueSendFlow = (data: SendFlowJobData) =>
    integrationQueue.add(
      IntegrationJobAction.sendFlow,
      { type: IntegrationJobAction.sendFlow, data },
      flowContinuationJobOptions(data.metadata),
    )

  const enqueueBranch = (
    branch: DeferredBranchJob,
    then: SendFlowJobData | undefined,
  ) => {
    const job: IntegrationJobRunFlowNode = then
      ? { ...branch.job, data: { ...branch.job.data, thenSendFlow: then } }
      : branch.job
    return integrationQueue.add(IntegrationJobAction.sendFlow, job, {
      ...flowContinuationJobOptions(job.data.metadata),
      jobId: branch.jobId,
    })
  }

  const takeThen = (): SendFlowJobData | undefined => {
    if (isThenHandedOff) {
      return
    }
    isThenHandedOff = true
    return thenSendFlow
  }

  return {
    /** The pending continuation, for a branch that ends the node's run. */
    takeThen,
    deferBranch(branch: DeferredBranchJob) {
      deferredBranch = branch
    },
    /** Enqueues this node's continuation, behind a deferred branch if any. */
    async enqueue(data: SendFlowJobData) {
      const then = takeThen()
      const continuation = then ? { ...data, thenSendFlow: then } : data
      const branch = deferredBranch
      deferredBranch = undefined
      if (branch) {
        await enqueueBranch(branch, continuation)
        return
      }
      await enqueueSendFlow(continuation)
    },
    /** The node's run stopped: release whatever is still held. */
    async finish() {
      const branch = deferredBranch
      deferredBranch = undefined
      if (branch) {
        await enqueueBranch(branch, takeThen())
        return
      }
      const then = takeThen()
      if (then) {
        await enqueueSendFlow(then)
      }
    },
  }
}

export type ContinuationChain = ReturnType<typeof createContinuationChain>
