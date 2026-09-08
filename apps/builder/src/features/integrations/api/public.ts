import { integrationsAiPublicRouter } from "./public/ai"
import { integrationsCrudPublicRouter } from "./public/crud"

export const integrationsPublicRouter = {
  ...integrationsCrudPublicRouter,
  ...integrationsAiPublicRouter,
}
