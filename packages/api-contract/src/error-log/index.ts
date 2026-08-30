import { oc } from "@orpc/contract"
import { listErrorLogsInput, publicListErrorLogsResponse } from "./resource"

export const listErrorLogsContract = oc
  .route({
    method: "GET",
    path: "/v1/error-logs",
    summary: "List error logs",
    tags: ["Error Logs"],
  })
  .input(listErrorLogsInput)
  .output(publicListErrorLogsResponse)

export const errorLogContract = {
  listErrorLogsContract,
}

export * from "./resource"
