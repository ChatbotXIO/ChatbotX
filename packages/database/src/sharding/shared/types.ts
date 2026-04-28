export interface ShardConfig {
  credentialRef?: string | null
  database: string
  host: string
  id: string
  name: string
  port: number | null
  sslMode?: string | null
  user: string
}
