import { zodBigintAsString } from "@chatbotx.io/utils"
import { oc } from "@orpc/contract"
import { z } from "zod"
import { publicReflinkResource } from "./resource"

export const getRefLinkContract = oc
  .route({
    method: "GET",
    path: "/v1/ref-links/{id}",
    summary: "Get a specific ref link",
    tags: ["Ref Links"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .output(publicReflinkResource)

export const reflinkContract = {
  getRefLinkContract,
}

export * from "./resource"
