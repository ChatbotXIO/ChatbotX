/**
 * Builds the `x-amz-copy-source` value for CopyObject.
 *
 * Every other S3 operation addresses objects through the request URL
 * (`endpoint` + `/bucket/key` in path-style), so when `S3_ENDPOINT` carries a
 * path of its own (e.g. an R2 endpoint that already includes the bucket name),
 * objects are actually stored under that extra prefix. CopySource is sent as a
 * header — the endpoint path never applies to it — so it must replicate the
 * same prefix or it points at a key that does not exist (NoSuchKey).
 */
export function buildCopySource(
  sourcePath: string,
  bucket: string,
  endpoint?: string,
): string {
  const encodedSource = sourcePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  const endpointPath = endpoint
    ? new URL(endpoint).pathname.replace(/^\/+|\/+$/g, "")
    : ""
  const prefix = endpointPath ? `${endpointPath}/` : ""

  return `${prefix}${bucket}/${encodedSource}`
}
