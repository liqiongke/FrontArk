import HandlerBase from '@handler/handlerBase';

abstract class ViewBase<HandlerClass extends HandlerBase> {
  public handler!: HandlerClass;

  constructor(handler: HandlerClass) {
    this.handler = handler;
  }

  abstract getRootId(): string;
}

export default ViewBase;
