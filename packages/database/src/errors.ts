export class ModelNotfoundException extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelNotfoundException"
  }
}
