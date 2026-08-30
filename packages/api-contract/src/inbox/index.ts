import { oc } from "@orpc/contract"
import {
  listInboxesInput,
  publicListChannelsResponse,
  publicListInboxResponse,
} from "./resource"

export const listInboxesContract = oc
  .route({
    method: "GET",
    path: "/v1/inboxes",
    summary: "List inboxes",
    description:
      "List connected inboxes with their internal IDs. Use `id` as the `inboxId` parameter when sending messages or flows to a contact.",
    tags: ["Channels"],
  })
  .input(listInboxesInput)
  .output(publicListInboxResponse)

export const listChannelsContract = oc
  .route({
    method: "GET",
    path: "/v1/channels",
    summary: "List channels",
    tags: ["Channels"],
  })
  .input(listInboxesInput)
  .output(publicListChannelsResponse)

export const inboxContract = {
  listInboxesContract,
  listChannelsContract,
}

export * from "./resource"
