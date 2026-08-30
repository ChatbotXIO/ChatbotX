import { oc } from "@orpc/contract"
import { z } from "zod"
import {
  listBroadcastAudienceInput,
  publicBroadcastResource,
  publicListBroadcastAudienceResponse,
  publicListBroadcastsResponse,
} from "./resource"

export const listBroadcastsContract = oc
  .route({
    method: "GET",
    path: "/v1/broadcasts",
    summary: "Get all broadcasts",
    tags: ["Broadcasts"],
  })
  .output(publicListBroadcastsResponse)

export const getBroadcastContract = oc
  .route({
    method: "GET",
    path: "/v1/broadcasts/{idOrName}",
    summary: "Get broadcast by id or name",
    tags: ["Broadcasts"],
  })
  .input(z.object({ idOrName: z.string() }))
  .output(publicBroadcastResource)

export const getBroadcastAudienceContract = oc
  .route({
    method: "GET",
    path: "/v1/broadcasts/{idOrName}/audience",
    summary: "Get broadcast audience",
    tags: ["Broadcasts"],
  })
  .input(listBroadcastAudienceInput)
  .output(publicListBroadcastAudienceResponse)

export const broadcastContract = {
  listBroadcastsContract,
  getBroadcastContract,
  getBroadcastAudienceContract,
}

export * from "./resource"
