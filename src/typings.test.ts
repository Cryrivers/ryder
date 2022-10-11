import { describe, it } from 'vitest';
import type { MessageSource } from './typings';
import WebSocket from 'ws';

class RyderWebSocket extends WebSocket {
  public postMessage(data: string) {
    return this.send(data);
  }
}

describe('test TypeScript typings', () => {
  let ryderMessageSource: MessageSource;

  /**
   * @vitest-environment happy-dom
   */
  it('should support the following message source out-of-the-box', () => {
    ryderMessageSource = window;
    ryderMessageSource = new BroadcastChannel('test_channel');
    ryderMessageSource = new MessagePort();
    ryderMessageSource = new ServiceWorker();
    ryderMessageSource = new Worker('https://example.url/to/worker.js');
  });

  /**
   * @vitest-environment happy-dom
   */
  it('should not support WebSocket, but it should support it with a `postMessage` wrapper', () => {
    // @ts-expect-error
    ryderMessageSource = new WebSocket('https://example.url/ws');
    ryderMessageSource = new RyderWebSocket('https://example.url/ws');
  });
});
