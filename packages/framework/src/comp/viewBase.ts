import DataBase from '@/data/dataBase';
import HandlerBase from '@handler/handlerBase';

abstract class ViewBase<HandlerClass extends HandlerBase, DataSource extends DataBase> {
  public handler!: HandlerClass;
  public data!: DataSource;

  constructor(handler: HandlerClass, data: DataSource) {
    this.handler = handler;
    this.data = data;
  }

  abstract getRootId(): string;
}

export default ViewBase;
