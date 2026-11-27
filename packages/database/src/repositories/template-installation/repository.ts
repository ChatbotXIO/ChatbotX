import { templateInstallationLeaseRepository } from "./lease-repository"
import { templateInstallationPublishEffectsRepository } from "./publish-effects-repository"
import { templateInstallationRequestRepository } from "./request-repository"
import { templateInstallationStagedCleanupRepository } from "./staged-cleanup-repository"

export type {
  StaleTemplateInstallationRow,
  TemplateInstallationPageRow,
} from "./types"

/**
 * The installation repository, assembled from its concerns (requests and
 * listing, the install lease and sweep, staged-object cleanup, after-publish
 * effects). Callers keep using this one object.
 */
export const templateInstallationRepository = {
  ...templateInstallationRequestRepository,
  ...templateInstallationLeaseRepository,
  ...templateInstallationStagedCleanupRepository,
  ...templateInstallationPublishEffectsRepository,
}
