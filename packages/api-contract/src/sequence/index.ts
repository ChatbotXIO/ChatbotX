import { oc } from "@orpc/contract"
import { z } from "zod"
import {
  listSequencesInput,
  publicListSequencesResponse,
  publicSequenceResource,
} from "./resource"

export const listSequencesContract = oc
  .route({
    method: "GET",
    path: "/v1/sequences",
    summary: "List sequences",
    tags: ["Sequences"],
  })
  .input(listSequencesInput)
  .output(publicListSequencesResponse)

export const getSequenceContract = oc
  .route({
    method: "GET",
    path: "/v1/sequences/{id}",
    summary: "Get sequence details",
    tags: ["Sequences"],
  })
  .input(z.object({ id: z.string() }))
  .output(publicSequenceResource)

export const sequenceContract = {
  listSequencesContract,
  getSequenceContract,
}

export * from "./resource"
