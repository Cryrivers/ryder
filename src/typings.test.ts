import type { MessageSource } from './typings';

let ryderMessageSource: MessageSource;

// Ryder should support the following message source out-of-the-box
ryderMessageSource = window;
ryderMessageSource = new BroadcastChannel('test_channel');
ryderMessageSource = new MessagePort();
ryderMessageSource = new ServiceWorker();
ryderMessageSource = new Worker('https://example.url/to/worker.js');

// Ryder should not support WebSocket, but it should support it with a `postMessage` wrapper

// @ts-expect-error
ryderMessageSource = new WebSocket('https://example.url/ws');

class RyderWebSocket extends WebSocket {
  public postMessage(data: string) {
    return this.send(data);
  }
}

ryderMessageSource = new RyderWebSocket('https://example.url/ws');
