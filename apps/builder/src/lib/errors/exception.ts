export class BaseException extends Error {
  constructor(messages: string) {
    super(messages)

    Object.setPrototypeOf(this, new.target.prototype)
    this.name = new.target.name
  }
}

export class NotfoundException extends BaseException {}
