# Ryder

A Remote Procedure Call & Subscription Utility via `postMessage`

## The name

Ryder is of old English origin and means **cavalrymen, messenger**. And, Ryder is the main protagonist of the TV series [PAW Patrol](https://en.wikipedia.org/wiki/PAW_Patrol).

## Features

### Platform Agnostic

Ryder supports any message event sources that implements `postMessage` and `message` event. So `window`, `MessagePort`, `node:worker_threads`, `WebWorker`, `ServiceWorker` and `BroadcastChannel` are supported out of the box.

Other message event sources like `WebSocket`, WebRTC and Server-sent events could be supported with `postMessage` implemented by users.

#### Use Case

|                                                                                                                           | Client                                        | Server                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| An **iframe** executes functions, accesses or subscribes data in another **iframe**                                       | `window`(of an iframe)                        | `window`(of another iframe)                   |
| A **web page** executes functions, accesses or subscribes data in `WebWorker` or `ServiceWorker`                          | `window`                                      | `WebWorker` or `ServiceWorker`                |
| A **NodeJS** module executes functions, accesses or subscribes data in `node:worker_threads`                              | `node:worker_threads` (`parentPort`)          | `node:worker_threads`                         |
| A **web page** executes functions, accesses or subscribes data from **another web server**                                | `WebSocket`(with `postMessage` wrapper)       | `WebSocket` (with `postMessage` wrapper)      |
| A **web page** executes functions, accesses or subscribes data from **another peer** (WebRTC, peer-to-peer communication) | `RTCDataChannel` (with `postMessage` wrapper) | `RTCDataChannel` (with `postMessage` wrapper) |

##### Reference Implementation of WebSocket `postMessage` wrapper

```js
class RyderWebSocket extends WebSocket {
  postMessage(data) {
    return this.send(data);
  }
}
```

## Installation

```sh
# npm
npm install ryder

# yarn
yarn add ryder

# pnpm
pnpm add ryder
```

## Usage

### Server

```ts
async function fetchData(type: string) {
  await timeout(1000);
  return `Answer for ${type} is 42`;
}

const rpcMap = {
  fetchAnswer: fetchData,
  isLoading: false,
};

const subscriptionMap = {
  // Outputs 0, 1, 2, 3, 4 ... every 1000ms
  interval: intervalSubscription,
};

const { messageHandler } = createServerBridge({
  subscriptionHandler: (
    propertyPath: string[],
    onValueChange: (value: unknown) => void
  ) => {
    const unsubscribe = subscriptionMap(propertyPath[0]).subscribe(
      onValueChange
    );
    return unsubscribe;
  },
  invokeHandler: (propertyPath: PropertyKey[]) => rpcMap[propertyPath[0]],
});
```

### Client

```ts
const bridge = createClientBridge({
  serverFinder,
  requestCoalescing: true,
});

window.addEventListener('message', bridge.messageHandler);

// Function invocation, call remote `fetchData` with no parameters
const result = await bridge.invoke(
  ['fetchAnswer'],
  ['life the universe and everything']
); // Returns "Answer for life the universe and everything is 42"

// Variable access
const result = await bridge.invoke(['isLoading']); // Returns false

// Subscription
const unsubscribe = bridge.subscribe(['interval'], (value: number) => {
  console.log(value); // Prints 0, 1, 2, 3, 4 ... every 1000ms
});
```

## Advanced Techniques

### Usage of JavaScript Proxy

### Request Coalescing
