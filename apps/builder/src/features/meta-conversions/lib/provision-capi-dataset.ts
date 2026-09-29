import {
  capiDatasetResourceType,
  type MetaConversionsChannel,
  type ProvisionDatasetNowInput,
} from "@chatbotx.io/business"
import {
  buildDatasetName,
  ensureDataset,
} from "@chatbotx.io/integration-meta-conversions"

type ProvisionDataset = ProvisionDatasetNowInput["provisionDataset"]

/**
 * The `provisionDataset` callback every builder action hands to the business
 * layer: creates (or finds) the channel's CAPI dataset under the Meta resource
 * that channel hangs off. `accessToken` is the per-channel dataset-creation
 * token the adapter resolved, so Meta attributes the "Creator" correctly.
 */
export const capiDatasetProvisioner =
  (channel: MetaConversionsChannel): ProvisionDataset =>
  ({ accessToken, resourceId, resourceName }) =>
    ensureDataset({
      resourceType: capiDatasetResourceType(channel),
      resourceId,
      accessToken,
      datasetName: buildDatasetName(resourceName),
    })
