export const TOTAL_SCHEDULER_BUCKETS = 256

export const getAssignedBuckets = (): number[] => {
  const bucketRange = process.env.SCHEDULER_BUCKET_RANGE

  if (bucketRange) {
    if (bucketRange.includes(",")) {
      return bucketRange.split(",").map(Number)
    }

    const [start, end] = bucketRange.split("-").map(Number)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }

  return Array.from({ length: TOTAL_SCHEDULER_BUCKETS }, (_, index) => index)
}
