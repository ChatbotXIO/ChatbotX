import { oc } from "@orpc/contract"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "../errors"
import {
  createCustomFieldInput,
  deleteCustomFieldInput,
  getCustomFieldInput,
  publicCustomFieldResource,
  publicListCustomFieldsResponse,
  updateCustomFieldInput,
} from "./resource"

export const listCustomFieldsContract = oc
  .route({
    method: "GET",
    path: "/v1/custom-fields",
    summary: "Get all custom fields",
    tags: ["Custom Fields"],
  })
  .input(z.object({}))
  .output(publicListCustomFieldsResponse)
  .errors(possibleErrorsOnFindingResource)

export const createCustomFieldContract = oc
  .route({
    method: "POST",
    path: "/v1/custom-fields",
    summary: "Create a custom field",
    successStatus: 201,
    tags: ["Custom Fields"],
  })
  .input(createCustomFieldInput)
  .output(publicCustomFieldResource)
  .errors(possibleErrorsOnCreatingResource)

export const getCustomFieldContract = oc
  .route({
    method: "GET",
    path: "/v1/custom-fields/{idOrName}",
    summary: "Get custom field by id or name",
    tags: ["Custom Fields"],
  })
  .input(getCustomFieldInput)
  .output(publicCustomFieldResource)
  .errors(possibleErrorsOnFindingResource)

export const updateCustomFieldContract = oc
  .route({
    method: "PUT",
    path: "/v1/custom-fields/{id}",
    summary: "Update custom field",
    tags: ["Custom Fields"],
  })
  .input(updateCustomFieldInput)
  .output(publicCustomFieldResource)
  .errors(possibleErrorsOnUpdatingResource)

export const deleteCustomFieldContract = oc
  .route({
    method: "DELETE",
    path: "/v1/custom-fields/{id}",
    summary: "Delete custom field",
    successStatus: 204,
    tags: ["Custom Fields"],
  })
  .input(deleteCustomFieldInput)
  .errors(possibleErrorsOnDeletingResource)

export const customFieldContract = {
  listCustomFieldsContract,
  createCustomFieldContract,
  getCustomFieldContract,
  updateCustomFieldContract,
  deleteCustomFieldContract,
}

export * from "./resource"
