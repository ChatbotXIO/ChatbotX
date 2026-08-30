import { oc } from "@orpc/contract"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
} from "../errors"
import {
  createExternalWebhookInput,
  deleteExternalWebhookInput,
  publicExternalWebhookResource,
  publicListExternalWebhooksResponse,
} from "./resource"

export const listExternalWebhooksContract = oc
  .route({
    method: "GET",
    path: "/v1/external-webhooks",
    summary: "List external webhooks",
    description:
      "List webhooks registered by external automation platforms (e.g. Make) for this workspace.",
    tags: ["External Webhooks"],
  })
  .output(publicListExternalWebhooksResponse)
  .errors(possibleErrorsOnListingResource)

export const createExternalWebhookContract = oc
  .route({
    method: "POST",
    path: "/v1/external-webhooks",
    summary: "Register an external webhook",
    description:
      "Registers a URL to receive events for a given event name. Idempotent — registering the same (event, url) again returns the existing registration.",
    successStatus: 201,
    tags: ["External Webhooks"],
  })
  .input(createExternalWebhookInput)
  .output(publicExternalWebhookResource)
  .errors(possibleErrorsOnCreatingResource)

export const deleteExternalWebhookContract = oc
  .route({
    method: "DELETE",
    path: "/v1/external-webhooks/{id}",
    summary: "Unregister an external webhook",
    successStatus: 204,
    tags: ["External Webhooks"],
  })
  .input(deleteExternalWebhookInput)
  .errors(possibleErrorsOnDeletingResource)

export const externalWebhookContract = {
  listExternalWebhooksContract,
  createExternalWebhookContract,
  deleteExternalWebhookContract,
}

export * from "./resource"
