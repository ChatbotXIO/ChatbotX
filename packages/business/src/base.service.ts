import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { dispatchAuditRecord } from "./audit/dispatcher"

export class BaseService {
  protected invalidateCacheTags(tags: string | string[]) {
    return invalidateCacheByTags(Array.isArray(tags) ? tags : [tags])
  }

  protected audit(action: string, detail: string) {
    return dispatchAuditRecord({ action, detail })
  }
}
