import { oc } from "@orpc/contract"
import { z } from "zod"
import { publicListFlowsResponse } from "./resource"

export const listFlowsContract = oc
  .route({
    method: "GET",
    path: "/v1/flows",
    summary: "Get all flows",
    tags: ["Flows"],
  })
  .input(z.object({}))
  .output(publicListFlowsResponse)

export const flowContract = {
  listFlowsContract,
}

export * from "./resource"
