import { authMiddleware } from "./middlewares/auth"
import { base } from "./middlewares/context"

export const authorizedAPI = base.use(authMiddleware)
