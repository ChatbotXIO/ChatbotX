import { revalidateTag } from "next/cache"

export function calcCacheTags(input: string | string[]) {
  return {
    tags: Array.isArray(input) ? input : [input],
    revalidate: 60 * 60, // 1 hour
  }
}

export function revalidateCacheTags(input: string | string[]) {
  for (const tag of Array.isArray(input) ? input : [input]) {
    revalidateTag(tag, "max")
  }
}
