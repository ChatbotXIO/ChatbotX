import { oc } from "@orpc/contract"
import { publicListKeywordsResponse } from "./resource"

export const listKeywordsContract = oc
  .route({
    method: "GET",
    path: "/v1/keywords",
    summary: "List keywords (automated responses)",
    tags: ["Keywords"],
  })
  .output(publicListKeywordsResponse)

export const keywordContract = {
  listKeywordsContract,
}

export * from "./resource"
