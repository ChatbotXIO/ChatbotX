export class BaseException extends Error {
  constructor(messages: string) {
    super(messages)

    Object.setPrototypeOf(this, BaseException.prototype)
  }
}

export class NotfoundException extends BaseException {}
