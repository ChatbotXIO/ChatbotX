import { getContactScanStatusRequest } from "./query"

export const getContactScanStatusPublicRequest =
  getContactScanStatusRequest.omit({
    workspaceId: true,
  })

export { getContactScanStatusResponse } from "./query"
