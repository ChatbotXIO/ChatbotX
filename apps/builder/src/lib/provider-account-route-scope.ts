import { messageStatusBranchService } from "@chatbotx.io/business"
import type { ProviderAccountRouteScope } from "@chatbotx.io/database/partials"
import type { ContextQueue } from "@chatbotx.io/sdk"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
  type IntegrationJobData,
  type IntegrationJobMessageStatus,
  type IntegrationJobProviderAccountEvent,
} from "@chatbotx.io/worker-config"
import { logger } from "@/lib/log"

/**
 * Meta sends the same `account_update` to every app subscribed to a WABA, so
 * the platform route, a reseller's route and a manual route all enqueue the
 * same event. The job id therefore carries the route, or the second route's
 * job would be dropped as a duplicate of the first. BullMQ rejects `:`.
 */
const routeScopeKey = (routeScope: ProviderAccountRouteScope): string => {
  switch (routeScope.kind) {
    case "platform":
      return "platform"
    case "credentialOwner":
      return `owner-${routeScope.ownerId}`
    case "manualIntegration":
      return `manual-${routeScope.integrationId}`
    default: {
      const _exhaustive: never = routeScope
      return _exhaustive
    }
  }
}

const toSafeJobIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_")

type AddArgs = Parameters<ContextQueue["add"]>

/**
 * Ingress-time facts a job needs for queue routing, stamped by the app layer
 * (never by a channel integration). A status is flagged when it runs a branch
 * that continues a flow, which keeps it on `integration`; any other status is
 * bookkeeping and is routed to `low`.
 */
const ingressJobStampers: Partial<
  Record<AddArgs[0], (job: IntegrationJobData) => Promise<IntegrationJobData>>
> = {
  [IntegrationJobAction.messageStatus]: async (job) => {
    const statusJob = job as IntegrationJobMessageStatus
    const continuesFlow = await messageStatusBranchService.continuesFlow({
      channel: statusJob.data.integrationType,
      providerMessageId: statusJob.data.payload.messageId,
      status: statusJob.data.payload.status,
    })
    return { ...statusJob, data: { ...statusJob.data, continuesFlow } }
  },
}

/**
 * Adds a job to the integration queue. A provider account event names a
 * WABA/page-level account, not a phone number, so it carries no inbox
 * identifier to authorise against: the route that authenticated the delivery
 * stamps who it speaks for (and puts itself in the job id), and the worker only
 * touches connections inside that scope. With no scope the route could not say
 * who it speaks for, so the event is dropped loudly rather than half applied.
 * Every other job is enqueued as-is, after any ingress stamp that its routing
 * depends on (`ingressJobStampers`); `enqueueIntegrationJob` then picks the queue.
 */
export const addRouteScopedJob = async (
  name: AddArgs[0],
  payload: AddArgs[1],
  options: AddArgs[2],
  routeScope: ProviderAccountRouteScope | undefined,
) => {
  if (name !== IntegrationJobAction.providerAccountEvent) {
    const stamp = ingressJobStampers[name]
    return await enqueueIntegrationJob(
      stamp ? await stamp(payload) : payload,
      options,
    )
  }
  if (!routeScope) {
    logger.error(
      { name },
      "Provider account event dropped: the webhook credential has no app id to scope it",
    )
    return
  }

  // `name` identifies the job type, so the payload is the account event job.
  const job = payload as IntegrationJobProviderAccountEvent
  return await enqueueIntegrationJob(
    { ...job, data: { ...job.data, routeScope } },
    options?.jobId
      ? {
          ...options,
          jobId: `${options.jobId}-${toSafeJobIdSegment(routeScopeKey(routeScope))}`,
        }
      : options,
  )
}

/** The integration queue whose provider account events are scoped to `routeScope`; every other job passes through. */
export const createRouteScopedQueue = (
  routeScope: ProviderAccountRouteScope | undefined,
): ContextQueue => ({
  add: (name, payload, options) =>
    addRouteScopedJob(name, payload, options, routeScope),
})
