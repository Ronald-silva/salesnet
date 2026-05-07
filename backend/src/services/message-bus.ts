import { EventEmitter } from 'events';

export interface IncomingMessage {
  phone: string;       // E.164 format, e.g. "+5585999990000"
  body: string;
  profileName?: string;
}

class MessageBus extends EventEmitter {
  onIncomingMessage(handler: (msg: IncomingMessage) => void): void {
    this.on('incoming_message', handler);
  }

  emitIncomingMessage(msg: IncomingMessage): void {
    this.emit('incoming_message', msg);
  }
}

export const messageBus = new MessageBus();
