import {
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
  RyderCommand,
  RyderServerCommands,
} from './constants';
import {
  isRyderServerPayload,
  noProcessing,
  createPayload,
  type ClientPayload,
  type ClientPayloadNoCoalescingRequest,
  ServerPayload,
} from './utils';

const MAX_QUEUED_COMMANDS = 100;

export function createClientBridge(options: {
  serverFinder: (() => MessageEventSource | null) | false; // Passive Mode if false
  requestCoalescing?: boolean;
  serializer?: (value: unknown) => unknown;
  deserializer?: (value: unknown) => unknown;
}) {
  const {
    serverFinder,
    requestCoalescing = false,
    serializer = noProcessing,
    deserializer = noProcessing,
  } = options;

  let target: MessageEventSource | null = null;
  const _pendingCommandQueue: ClientPayloadNoCoalescingRequest[] = [];
  const subscriptionRequestIdMap = new Map<string, (value: unknown) => void>();
  const invokeRequestIdPromiseMap = new Map<
    string,
    {
      resolve: (value?: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  let pendingQueueCoalescingTimerId: number;
  let flushQueueCoalescingTimerId: number;

  function pushPendingQueue(payload: ClientPayloadNoCoalescingRequest) {
    function act() {
      _pendingCommandQueue.push(payload);
    }
    if (!requestCoalescing) {
      act();
    } else {
      clearTimeout(pendingQueueCoalescingTimerId);
      pendingQueueCoalescingTimerId = setTimeout(act, 0);
    }
  }

  function optimizeCommandQueue() {
    if (_pendingCommandQueue.length <= 1) {
      // No commands or only one command. No
      // need to optimise
      return;
    }
    // Negate Subscribe / Unsubscribe with the same request id, removing both from the queue
    // TODO: To be implemented
  }

  function flushPendingCommandQueue() {
    function act() {
      if (serverFinder && !target) {
        // Active Mode (Client actively searching for Server)
        // Call `serverFinder` see if we can find a server
        target = serverFinder();
      }

      if (target) {
        // Optimise the pending command queue
        optimizeCommandQueue();
        if (requestCoalescing) {
          target.postMessage(
            JSON.stringify(
              serializer(
                createPayload(RyderCommand.CoalesceRequestClient, {
                  requests: _pendingCommandQueue,
                })
              )
            )
          );
        } else {
          let payload: ClientPayload | undefined;
          while ((payload = _pendingCommandQueue.shift())) {
            target.postMessage(JSON.stringify(serializer(payload)));
          }
        }
      } else {
        // Throw an error if the number of commands hit the upper limit
        if (_pendingCommandQueue.length > MAX_QUEUED_COMMANDS) {
          throw new Error(
            'Too many queued commands and no RyderServer found and connected.'
          );
        }
      }
    }
    if (!requestCoalescing) {
      act();
    } else {
      clearTimeout(flushQueueCoalescingTimerId);
      flushQueueCoalescingTimerId = setTimeout(act, 0);
    }
  }

  function processPayload(event: MessageEvent<string>, payload: ServerPayload) {
    const { [RYDER_REQUEST_ID_FIELD]: clientRequestId } = payload;
    switch (payload[RYDER_COMMAND_FIELD]) {
      case RyderCommand.DiscoveryServer: {
        if (serverFinder) {
          // Active Mode (Client actively searching for Server)
          // So we ignore the server discovery message
        } else {
          target = event.source;
          flushPendingCommandQueue();
        }
        break;
      }
      case RyderCommand.InvokeServerSuccess: {
        const promiseHandler = invokeRequestIdPromiseMap.get(clientRequestId);
        if (promiseHandler) {
          promiseHandler.resolve(payload.value);
          invokeRequestIdPromiseMap.delete(clientRequestId);
        } else {
          throw new Error(
            `Unable to find handler for request id: ${clientRequestId}`
          );
        }

        break;
      }
      case RyderCommand.InvokeServerError: {
        const promiseHandler = invokeRequestIdPromiseMap.get(clientRequestId);
        if (promiseHandler) {
          promiseHandler.reject(payload.reason);
          invokeRequestIdPromiseMap.delete(clientRequestId);
        } else {
          throw new Error(
            `Unable to find handler for request id: ${clientRequestId}`
          );
        }
        break;
      }
      case RyderCommand.SubscribeServerSuccess:
      case RyderCommand.UnsubscribeServerSuccess: {
        // Do nothing
        // since the subscription function has already been registered or removed
        break;
      }
      case RyderCommand.SubscribeServerUpdate: {
        const { value, [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId } =
          payload;
        const callback = subscriptionRequestIdMap.get(subscriptionRequestId);
        if (callback) {
          callback(value);
        } else {
          throw new Error(
            `Potential memory leaking at RyderServer. Subscription for ${subscriptionRequestId} doesn't exist.`
          );
        }
        break;
      }
      default:
        throw new Error(`Not Implemented: ${payload[RYDER_COMMAND_FIELD]}`);
    }
  }

  function serverPayloadHandler(event: MessageEvent<string>) {
    const { data } = event;
    let payload: unknown;
    try {
      payload = deserializer(JSON.parse(data));
    } catch {
      // Unable to parse and deserialize the message. just ignore
      return;
    }
    if (isRyderServerPayload(payload)) {
      console.log(`[RyderClient] Payload:`, payload);
      switch (payload[RYDER_COMMAND_FIELD]) {
        case RyderCommand.CoalesceRequestServer: {
          const { responses } = payload;
          responses.forEach(p => processPayload(event, p));
        }
        default:
          processPayload(event, payload);
      }
    } else {
      // Ignore this message
      // It shouldn't come from Ryder
    }
  }

  return {
    invoke(propertyPath: PropertyKey[], ...args: unknown[]) {
      const invokePayload = createPayload(RyderCommand.InvokeClient, {
        propertyPath,
        args,
      });
      const { [RYDER_REQUEST_ID_FIELD]: requestId } = invokePayload;
      console.log(`[Invoke] Request Id: ${requestId}`);
      pushPendingQueue(invokePayload);
      return new Promise((resolve, reject) => {
        invokeRequestIdPromiseMap.set(requestId, { resolve, reject });
        flushPendingCommandQueue();
      });
    },
    subscribe(propertyPath: PropertyKey[], onChange: (value: any) => void) {
      const subscribePayload = createPayload(RyderCommand.SubscribeClient, {
        propertyPath,
      });
      const { [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId } =
        subscribePayload;
      subscriptionRequestIdMap.set(subscriptionRequestId, onChange);
      pushPendingQueue(subscribePayload);
      flushPendingCommandQueue();
      return () => {
        const unsubscribePayload = createPayload(
          RyderCommand.UnsubscribeClient,
          {
            subscriptionRequestId,
            propertyPath,
          }
        );
        pushPendingQueue(unsubscribePayload);
        flushPendingCommandQueue();
        subscriptionRequestIdMap.delete(subscriptionRequestId);
      };
    },
    messageHandler: serverPayloadHandler,
  };
}
