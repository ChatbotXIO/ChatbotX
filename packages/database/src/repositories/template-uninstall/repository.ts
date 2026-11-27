import { templateUninstallClaimRepository } from "./claims"
import { templateUninstallEffectRepository } from "./effects"
import { templateUninstallInstallRootRepository } from "./install-roots"
import { templateUninstallOperationRepository } from "./operations"
import { templateUninstallTombstoneRepository } from "./tombstones"

export type { TemplateUninstallFinalState } from "./claims"
export { TEMPLATE_UNINSTALL_MAX_EFFECT_ATTEMPTS } from "./effects"
export type { InstallFolderRow } from "./install-roots"
export type { TemplateUninstallOperationRow } from "./operations"
export type {
  InboundEdge,
  ReferenceColumnProbe,
  ReferenceContainerProbe,
  ReferenceSlots,
} from "./references"
export { templateUninstallReferenceRepository } from "./references"

/**
 * The uninstall state machine and its operation table, composed from the
 * concern modules (claims, tombstones, effects, operations, install roots) so
 * callers keep one stable repository object.
 */
export const templateUninstallStateRepository = {
  ...templateUninstallClaimRepository,
  ...templateUninstallTombstoneRepository,
  ...templateUninstallEffectRepository,
  ...templateUninstallOperationRepository,
  ...templateUninstallInstallRootRepository,
}
