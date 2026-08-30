import { oc } from "@orpc/contract"
import {
  listWhatsappMessageTemplatesInput,
  publicListWhatsappMessageTemplatesResponse,
} from "./resource"

export const listWhatsappMessageTemplatesContract = oc
  .route({
    method: "GET",
    path: "/v1/template-messages",
    summary: "List template messages",
    tags: ["Template Messages"],
  })
  .input(listWhatsappMessageTemplatesInput)
  .output(publicListWhatsappMessageTemplatesResponse)

export const whatsappMessageTemplateContract = {
  listWhatsappMessageTemplatesContract,
}

export * from "./resource"
