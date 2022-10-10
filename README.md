# Ryder

A Remote Procedure Call & Subscription Utility via `MessageEventSource` (a.k.a `postMessage`)

## The name

Ryder is of old English origin and means **cavalrymen, messenger**. And, Ryder is the main protagonist of the TV series [PAW Patrol](https://en.wikipedia.org/wiki/PAW_Patrol).

## Features

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
async function fetchAnswer(type: string) {
  await timeout(1000);
  return `Answer for ${type} is 42`;
}
const rpcMap = {
  fetchAnswer,
  isLoading: false,
};

function invokeHandler(propertyPath: string[], args: unknown) {
  const rpc = rpcMap[proppertyPath[0]];
  if (typeof rpc === 'function') {
    return rpc(...args);
  } else {
    return rpc;
  }
}

function subscriptionHandler(
  propertyPath: string[],
  onValueChange: (value: unknown) => void
);

const { messageHandler } = createServerBridge({
  serializer,
  deserializer,
  subscriptionHandler,
  invokeHandler,
});
```

### Client

```ts
const bridge = createClientBridge({
  serializer,
  serverFinder,
  deserializer,
  requestCoalescing: true,
});

window.addEventListener('message', bridge.messageHandler);

// Function invocation, call remote `fetchData` with no parameters
const result = await bridge.invoke(
  ['fetchAnswer'],
  ['life the universe and everything']
); // Returns "Answer for life the universe and everything is 42"

// Subscription
const unsubscribe = bridge.subscribe(['fibonacci'], (value: number) => {
  console.log(value);
});
```

## Advanced Techniques
