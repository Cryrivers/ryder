export interface MessageSource {
  addEventListener(
    type: 'message',
    listener: (ev: MessageEvent<string>) => any
  ): void;
  postMessage(message: string): void;
  removeEventListener(
    type: 'message',
    listener: (ev: MessageEvent<string>) => any
  ): void;
}
