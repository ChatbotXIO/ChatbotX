export function calcCacheTags(input: string | string[]) {
  return {
    tags: Array.isArray(input) ? input : [input],
    revalidate: 60 * 60, // 1 hour
  }
}
