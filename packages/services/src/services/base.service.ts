import { invalidateCacheByTags } from "@chatbotx.io/redis"

export class BaseService {
  protected readonly cachePrefix: string = "cache"

  protected invalidateCacheTags(tags: string | string[]) {
    return invalidateCacheByTags(Array.isArray(tags) ? tags : [tags])
  }
}
