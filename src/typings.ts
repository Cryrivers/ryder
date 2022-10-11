interface RyderMessageEvent {
  /** Returns the data of the message. */
  readonly data: string;
  /** Returns the last event ID string, for server-sent events. */
  readonly source: MessageEventSource | null;
}

export interface MessageSource {
  addEventListener(
    type: 'message',
    listener: (ev: RyderMessageEvent) => any
  ): void;
  postMessage(message: string): void;
  removeEventListener(
    type: 'message',
    listener: (ev: RyderMessageEvent) => any
  ): void;
}
