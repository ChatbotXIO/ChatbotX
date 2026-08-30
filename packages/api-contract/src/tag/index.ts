import { oc } from "@orpc/contract"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "../errors"
import { publicListTagsResponse, publicTagResource } from "./resource"
import {
  createTagInput,
  deleteTagInput,
  getTagInput,
  listTagsInput,
  updateTagInput,
} from "./schema"

export const listTagsContract = oc
  .route({
    method: "GET",
    path: "/v1/tags",
    summary: "Get all tags",
    tags: ["Tags"],
  })
  .input(listTagsInput)
  .output(publicListTagsResponse)
  .errors(possibleErrorsOnFindingResource)

export const createTagContract = oc
  .route({
    method: "POST",
    path: "/v1/tags",
    summary: "Create a new tag",
    successStatus: 201,
    tags: ["Tags"],
  })
  .input(createTagInput)
  .output(publicTagResource)
  .errors(possibleErrorsOnCreatingResource)

export const getTagContract = oc
  .route({
    method: "GET",
    path: "/v1/tags/{idOrName}",
    summary: "Get tag by id or name",
    tags: ["Tags"],
  })
  .input(getTagInput)
  .output(publicTagResource)
  .errors(possibleErrorsOnFindingResource)

export const updateTagContract = oc
  .route({
    method: "PUT",
    path: "/v1/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(updateTagInput)
  .output(publicTagResource)
  .errors(possibleErrorsOnUpdatingResource)

export const deleteTagContract = oc
  .route({
    method: "DELETE",
    path: "/v1/tags/{id}",
    summary: "Delete tag",
    successStatus: 204,
    tags: ["Tags"],
  })
  .input(deleteTagInput)
  .errors(possibleErrorsOnDeletingResource)

export const tagContract = {
  listTagsContract,
  createTagContract,
  getTagContract,
  updateTagContract,
  deleteTagContract,
}

export * from "./resource"
export * from "./schema"
