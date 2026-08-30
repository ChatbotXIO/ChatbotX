import { oc } from "@orpc/contract"
import { z } from "zod"
import { publicListSavedRepliesResponse } from "./resource"

export const listSavedRepliesContract = oc
  .route({
    method: "GET",
    path: "/v1/saved-replies",
    summary: "List saved replies",
    tags: ["Saved Replies"],
  })
  .input(z.object({}))
  .output(publicListSavedRepliesResponse)

export const savedReplyContract = {
  listSavedRepliesContract,
}

export * from "./resource"
