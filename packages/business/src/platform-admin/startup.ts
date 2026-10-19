import { logger } from "../logger"
import { platformAdminService } from "./service"

export const bootstrapPlatformAdminAtStartup = async (): Promise<void> => {
  const provisioned = await platformAdminService.provisionBootstrapAdmin()
  if (provisioned) {
    logger.info("Provisioned platform bootstrap administrator")
  }
}
