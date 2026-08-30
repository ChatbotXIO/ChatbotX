import { oc } from "@orpc/contract"
import { publicListTriggersResponse } from "./resource"

export const listTriggersContract = oc
  .route({
    method: "GET",
    path: "/v1/triggers",
    summary: "List triggers",
    tags: ["Triggers"],
  })
  .output(publicListTriggersResponse)

export const triggerContract = {
  listTriggersContract,
}

export * from "./resource"
