export class ShardNotActiveError extends Error {
  constructor(
    message = "No active shard configured. Admin must activate a shard.",
  ) {
    super(message)
    this.name = "ShardNotActiveError"
  }
}

export class ShardUnreachableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ShardUnreachableError"
  }
}
