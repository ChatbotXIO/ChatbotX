import { revalidateTag } from "next/cache"

export function calcCacheTags(
  input: string | string[],
  revalidate: number | false = 60 * 60,
) {
  return {
    tags: Array.isArray(input) ? input : [input],
    revalidate,
  }
}

export function revalidateCacheTags(input: string | string[]) {
  for (const tag of Array.isArray(input) ? input : [input]) {
    revalidateTag(tag, "max")
  }
}
