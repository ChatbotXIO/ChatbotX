import type { TemplateModel } from "@chatbotx.io/database/types"

/** Whether a template's share link currently resolves: switched on and not past its expiry. */
export const isShareLive = (
  template: Pick<TemplateModel, "shareEnabled" | "shareExpiresAt">,
  now: number = Date.now(),
): boolean =>
  template.shareEnabled &&
  !(template.shareExpiresAt && template.shareExpiresAt.getTime() < now)
