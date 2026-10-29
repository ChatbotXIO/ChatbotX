import type { PassThrough } from "node:stream"

export type UploadWriter = {
  /**
   * Resolves once the upload has taken the chunk (backpressure, so the
   * producer never outruns it), and rejects as soon as the upload fails.
   */
  write: (chunk: string) => Promise<void>
  /** Ends the stream and waits for the upload to complete. */
  finish: () => Promise<void>
  /**
   * Stops the stream and waits for the upload to settle; lib-storage then
   * aborts the multipart upload (leavePartsOnError=false), leaving no parts.
   */
  abort: () => Promise<void>
}

/**
 * Writer over a streaming upload (`createUpload`). Once its part uploads fail,
 * lib-storage stops reading the stream and a pending write never calls back
 * (destroying the stream does not release it either), which would hold the
 * job forever; so the upload's failure rejects the pending write itself.
 * Writes must be awaited one at a time, so there is at most one to reject.
 */
export function toUploadWriter(upload: {
  stream: PassThrough
  done: Promise<void>
}): UploadWriter {
  const { stream, done } = upload
  let failure: { error: unknown } | null = null
  let rejectPendingWrite: ((error: unknown) => void) | null = null
  done.catch((error: unknown) => {
    failure = { error }
    rejectPendingWrite?.(error)
  })

  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) => {
      if (failure) {
        reject(failure.error)
        return
      }
      rejectPendingWrite = reject
      stream.write(chunk, (error) => {
        rejectPendingWrite = null
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })

  return {
    write,
    finish: async () => {
      stream.end()
      await done
    },
    abort: async () => {
      stream.destroy()
      await done.catch(() => undefined)
    },
  }
}
