import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { dispatchAuditRecord } from "./audit/dispatcher"
import { withAuditService } from "./audit/service-tag"

export class BaseService {
  protected invalidateCacheTags(tags: string | string[]) {
    return invalidateCacheByTags(Array.isArray(tags) ? tags : [tags])
  }

  protected audit(action: string, detail: string) {
    // `constructor.name` is a class identifier fixed in code, not request data, so
    // it is safe in the log line. It names the domain that acted; the resource
    // itself stays only in `detail`, which is never logged.
    return dispatchAuditRecord(
      withAuditService({ action, detail }, this.constructor.name),
    )
  }
}
