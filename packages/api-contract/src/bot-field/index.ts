import { oc } from "@orpc/contract"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
} from "../errors"
import {
  bulkUpdateBotFieldsInput,
  createBotFieldInput,
  deleteBotFieldInput,
  getBotFieldInput,
  publicBotFieldResource,
  publicListBotFieldsResponse,
  setBotFieldInput,
  setBotFieldsInput,
} from "./resource"

export const listBotFieldsContract = oc
  .route({
    method: "GET",
    path: "/v1/bot-fields",
    summary: "Get all bot fields",
    tags: ["Bot Fields"],
  })
  .input(z.object({}))
  .output(publicListBotFieldsResponse)
  .errors(possibleErrorsOnFindingResource)

export const createBotFieldContract = oc
  .route({
    method: "POST",
    path: "/v1/bot-fields",
    summary: "Create a new bot field",
    successStatus: 201,
    tags: ["Bot Fields"],
  })
  .input(createBotFieldInput)
  .output(publicBotFieldResource)
  .errors(possibleErrorsOnCreatingResource)

export const getBotFieldContract = oc
  .route({
    method: "GET",
    path: "/v1/bot-fields/{idOrName}",
    summary: "Get bot field by id or name",
    tags: ["Bot Fields"],
  })
  .input(getBotFieldInput)
  .output(publicBotFieldResource)
  .errors(possibleErrorsOnFindingResource)

export const setBotFieldContract = oc
  .route({
    method: "PUT",
    path: "/v1/bot-fields/{idOrName}",
    summary: "Set bot field value by id or name",
    tags: ["Bot Fields"],
  })
  .input(setBotFieldInput)
  .output(publicBotFieldResource)
  .errors(possibleErrorsOnCreatingResource)

export const setBotFieldsContract = oc
  .route({
    method: "PUT",
    path: "/v1/bot-fields",
    summary: "Set multiple bot field values",
    successStatus: 204,
    tags: ["Bot Fields"],
  })
  .input(setBotFieldsInput)
  .errors(possibleErrorsOnCreatingResource)

export const bulkUpdateBotFieldsContract = oc
  .route({
    method: "PUT",
    path: "/v1/bot-fields/bulk-update",
    summary: "Bulk update bot field values by id or name",
    successStatus: 204,
    tags: ["Bot Fields"],
  })
  .input(bulkUpdateBotFieldsInput)
  .errors(possibleErrorsOnCreatingResource)

export const deleteBotFieldContract = oc
  .route({
    method: "DELETE",
    path: "/v1/bot-fields/{idOrName}",
    summary: "Unset the value of the bot field by id or name",
    successStatus: 204,
    tags: ["Bot Fields"],
  })
  .input(deleteBotFieldInput)
  .errors(possibleErrorsOnDeletingResource)

export const botFieldContract = {
  listBotFieldsContract,
  createBotFieldContract,
  getBotFieldContract,
  setBotFieldContract,
  setBotFieldsContract,
  bulkUpdateBotFieldsContract,
  deleteBotFieldContract,
}

export * from "./resource"
