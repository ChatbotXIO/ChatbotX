import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3"

export interface NdjsonIngestManifestStore {
  filterNotIngested(objectKeys: string[]): Promise<string[]>
  claimForProcessing(objectKey: string): Promise<number | null>
  markIngested(objectKey: string): Promise<void>
  markFailed(objectKey: string, errorMessage: string): Promise<void>
}

export interface ClickhouseClient {
  command: (params: {
    query: string
    // biome-ignore lint/suspicious/noExplicitAny: wrapper interface needs to accept ClickHouse client's internal ClickHouseSettings type
    clickhouse_settings?: any
    query_params?: Record<string, unknown>
  }) => Promise<unknown>
}

export interface ClickhouseIngesterConfig {
  s3Client: S3Client
  s3Endpoint: string
  s3Bucket: string
  s3Prefix: string
  s3AccessKey: string
  s3SecretKey: string
  manifestStore: NdjsonIngestManifestStore
  clickhouseClient: ClickhouseClient
  clickhouseDatabase: string
  clickhouseTable: string
  batchSize: number
  maxRetries: number
}

export class ClickhouseIngester {
  private readonly config: ClickhouseIngesterConfig
  private readonly s3Client: S3Client
  private isProcessing = false

  constructor(config: ClickhouseIngesterConfig) {
    this.config = config
    this.s3Client = config.s3Client
  }

  async ingestCommittedFiles(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true

    try {
      const committedFiles = await this.listCommittedFiles()

      for (const objectKey of committedFiles) {
        await this.ingestFile(objectKey)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async listCommittedFiles(): Promise<string[]> {
    const files: string[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.config.s3Bucket,
          Prefix: `${this.config.s3Prefix}/committed/`,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      )

      const contents = response.Contents || []
      const batchKeys: string[] = []
      for (const obj of contents) {
        if (obj.Key?.endsWith(".ndjson")) {
          batchKeys.push(obj.Key)
        }
      }

      const notIngested = await this.filterNotIngested(batchKeys)
      files.push(...notIngested)

      continuationToken = response.NextContinuationToken
    } while (continuationToken && files.length < this.config.batchSize)

    return files.slice(0, this.config.batchSize)
  }

  private filterNotIngested(objectKeys: string[]): Promise<string[]> {
    return this.config.manifestStore.filterNotIngested(objectKeys)
  }

  private async ingestFile(objectKey: string): Promise<void> {
    try {
      const attempts = await this.claimForProcessing(objectKey)
      if (attempts === null) {
        return
      }

      if (attempts >= this.config.maxRetries) {
        console.warn(
          `[ClickhouseIngester] File ${objectKey} exceeded max retries (${this.config.maxRetries}), skipping`,
        )
        return
      }

      const s3Url = `${this.config.s3Endpoint}/${this.config.s3Bucket}/${objectKey}`

      const query = `
        INSERT INTO ${this.config.clickhouseDatabase}.${this.config.clickhouseTable}
        SELECT * FROM s3(
          '${s3Url}',
          '${this.config.s3AccessKey}',
          '${this.config.s3SecretKey}',
          'JSONEachRow'
        )
      `
      console.log({ query })

      await this.config.clickhouseClient.command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      })

      await this.config.manifestStore.markIngested(objectKey)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      console.error(`[ClickhouseIngester] Failed to ingest ${objectKey}`, error)

      await this.config.manifestStore.markFailed(objectKey, errorMessage)
    }
  }

  private claimForProcessing(objectKey: string): Promise<number | null> {
    return this.config.manifestStore.claimForProcessing(objectKey)
  }
}
