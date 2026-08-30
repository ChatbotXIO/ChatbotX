import { oc } from "@orpc/contract"
import { publicListIntegrationsResponse } from "./resource"

export const listIntegrationsContract = oc
  .route({
    method: "GET",
    path: "/v1/integrations",
    summary: "List integrations",
    tags: ["Integrations"],
  })
  .output(publicListIntegrationsResponse)

export const integrationContract = {
  listIntegrationsContract,
}

export * from "./resource"
