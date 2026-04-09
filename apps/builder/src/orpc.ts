import { authMiddleware } from "./middlewares/auth"
import { base } from "./middlewares/context"
import { errorMiddleware } from "./middlewares/error-middleware"
import { workerAuthMiddleware } from "./middlewares/worker-authorized-middle-ware"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

export const authorizedAPI = base.use(authMiddleware).use(errorMiddleware)

export const workspaceTokenAuthAPI = base
  .use(workspaceTokenAuthMidddleware)
  .use(errorMiddleware)

export const workerAPI = base.use(workerAuthMiddleware).use(errorMiddleware)
