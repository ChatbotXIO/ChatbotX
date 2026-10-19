import {
  IntegrationJobAction,
  type IntegrationJobSendFlowPostback,
  type IntegrationJobSendFlowQuickReply,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { getFlowActionKey } from "./constants"
import { logger } from "./lib/logger"
import { resolveAutomatedResponseTiming } from "./smart-delay"

type FlowActionJob =
  | IntegrationJobSendFlowPostback
  | IntegrationJobSendFlowQuickReply

type FlowActionJobAction = FlowActionJob["type"]
type FlowActionJobData = FlowActionJob["data"]

type FlowActionJobConfigs = {
  postback: {
    jobAction: typeof IntegrationJobAction.runFlowPostback
    createJob: (
      data: IntegrationJobSendFlowPostback["data"],
    ) => IntegrationJobSendFlowPostback
    isDebounceEligible: (
      data: IntegrationJobSendFlowPostback["data"],
    ) => boolean
  }
  quickReply: {
    jobAction: typeof IntegrationJobAction.runFlowQuickReply
    createJob: (
      data: IntegrationJobSendFlowQuickReply["data"],
    ) => IntegrationJobSendFlowQuickReply
    isDebounceEligible: (
      data: IntegrationJobSendFlowQuickReply["data"],
    ) => boolean
  }
}

const flowActionJobConfigs: FlowActionJobConfigs = {
  postback: {
    jobAction: IntegrationJobAction.runFlowPostback,
    createJob: (data) => ({
      type: IntegrationJobAction.runFlowPostback,
      data,
    }),
    isDebounceEligible: (data) => !data.payload?.waFlowResponse,
  },
  quickReply: {
    jobAction: IntegrationJobAction.runFlowQuickReply,
    createJob: (data) => ({
      type: IntegrationJobAction.runFlowQuickReply,
      data,
    }),
    isDebounceEligible: () => true,
  },
}

export type FlowActionJobInput =
  | { kind: "postback"; data: IntegrationJobSendFlowPostback["data"] }
  | { kind: "quickReply"; data: IntegrationJobSendFlowQuickReply["data"] }

const addFlowActionJob = async (props: {
  jobAction: FlowActionJobAction
  job: FlowActionJob
  data: FlowActionJobData
  debounceEligible: boolean
}): Promise<boolean> => {
  try {
    if (!props.debounceEligible) {
      await integrationQueue.add(props.jobAction, props.job)
      return true
    }

    const timing = resolveAutomatedResponseTiming(null)

    await integrationQueue.add(props.jobAction, props.job, {
      deduplication: {
        id: getFlowActionKey(props.data),
        ttl: timing.ttlSeconds * 1000,
        extend: true,
        replace: true,
      },
      delay: timing.delaySeconds * 1000,
    })
    return true
  } catch (error) {
    logger.error(error, "Unable to trigger flow action")
    return false
  }
}

/** Resolves `false` when the job could not be queued (the error is logged). */
export const enqueueFlowAction = async (
  input: FlowActionJobInput,
): Promise<boolean> => {
  switch (input.kind) {
    case "postback":
      return await addFlowActionJob({
        jobAction: flowActionJobConfigs.postback.jobAction,
        job: flowActionJobConfigs.postback.createJob(input.data),
        data: input.data,
        debounceEligible: flowActionJobConfigs.postback.isDebounceEligible(
          input.data,
        ),
      })
    case "quickReply":
      return await addFlowActionJob({
        jobAction: flowActionJobConfigs.quickReply.jobAction,
        job: flowActionJobConfigs.quickReply.createJob(input.data),
        data: input.data,
        debounceEligible: flowActionJobConfigs.quickReply.isDebounceEligible(
          input.data,
        ),
      })
    default:
      return input satisfies never
  }
}
