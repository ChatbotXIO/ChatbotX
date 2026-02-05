export interface S3StorageConfig {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region: string
}

export interface ClickhouseConfig {
  database: string
  batchSize: number
  maxRetries: number
}

export function getS3StorageConfig(): S3StorageConfig {
  return {
    endpoint:
      process.env.S3_ENDPOINT ||
      process.env.AWS_URL ||
      process.env.MINIO_ENDPOINT ||
      "http://localhost:9000",
    bucket:
      process.env.S3_BUCKET ||
      process.env.AWS_BUCKET ||
      process.env.MINIO_BUCKET ||
      "ahachat",
    accessKey:
      process.env.S3_ACCESS_KEY ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.MINIO_ACCESS_KEY ||
      "ahachat",
    secretKey:
      process.env.S3_SECRET_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.MINIO_SECRET_KEY ||
      "nr541Kv59xB4f48bhZOy5wBz",
    region:
      process.env.S3_REGION ||
      process.env.AWS_REGION ||
      process.env.MINIO_REGION ||
      "us-east-1",
  }
}

export function getClickhouseConfig(): ClickhouseConfig {
  return {
    database: process.env.CLICKHOUSE_DATABASE || "chatbot_analytics",
    batchSize: Number.parseInt(process.env.CLICKHOUSE_BATCH_SIZE || "10", 10),
    maxRetries: Number.parseInt(process.env.CLICKHOUSE_MAX_RETRIES || "5", 10),
  }
}
