import {
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
  RyderCommand,
} from './constants';
import type { MessageSource } from './typings';
import {
  isRyderServerPayload,
  noProcessing,
  createPayload,
  type ClientPayload,
  type ClientPayloadNoCoalescingRequest,
  ServerPayload,
  isTargetNamespace,
} from './utils';

const MAX_QUEUED_COMMANDS = 100;

function noHandlerForRequestIdWarning(requestId: string, namespace: string) {
  const messageNoNS =
    `Unable to find a handler for request id: ${requestId}.` +
    ' This is likely due to multiple Ryder clients handling messages from the same Ryder server, or duplicated handler for `message` event. ' +
    ' If your project is only using one Ryder client, please check the code around `addEventListener`. ' +
    'Otherwise, please use `namespace` option in `createClientBridge`.';
  const messageWithNS = `Unable to find a handler for request id: "${requestId}", in namespace "${namespace}".`;
  console.warn(namespace === '' ? messageNoNS : messageWithNS);
}

interface ClientBridgeOptions {
  /**
   * The callback function to provide a Ryder Server to connect.
   */
  serverFinder: (() => MessageSource | null) | false;
  /**
   * Ryder clients only process messages from the same namespace.
   * If there are multiple Ryder clients handling messages from the same Ryder server.
   * A namespace needs to be assigned so Ryder clients only handle messages for itself,
   * discarding messages for other clients.
   *
   * @default ""
   */
  namespace?: string;
  /**
   * Indicates if Ryder coalesces multiple requests into one if possible. coalesced requests reduce
   * the number of `postMessage` calls, and guarantee the execution order without `await` if no data access needed
   * @default true
   */
  requestCoalescing?: boolean;
  /**
   * Custom JSON Serializer for custom objects.
   * The client and server should have the same serializer in order to communicate properly.
   */
  serializer?: (value: unknown) => unknown;
  /**
   * Custom JSON Deserializer for custom objects
   * The client and server should have the same deserializer in order to communicate properly.
   */
  deserializer?: (value: unknown) => unknown;
}

export function createClientBridge(options: ClientBridgeOptions) {
  const {
    serverFinder,
    requestCoalescing = true,
    serializer = noProcessing,
    deserializer = noProcessing,
    namespace = '',
  } = options;

  if (namespace === '*') {
    throw new Error(
      'Asterisk (*) is a wildcard character and matches all namespaces. Please use another name.'
    );
  }

  let target: MessageSource | null = null;

  const pendingCommandQueue: ClientPayloadNoCoalescingRequest[] = [];
  const subscriptionRequestIdMap = new Map<string, (value: unknown) => void>();
  const invokeRequestIdPromiseMap = new Map<
    string,
    {
      resolve: (value?: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  let flushQueueCoalescingTimerId: number;

  function optimizeCommandQueue() {
    if (pendingCommandQueue.length <= 1) {
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
        if (requestCoalescing && pendingCommandQueue.length > 1) {
          target.postMessage(
            JSON.stringify(
              serializer(
                createPayload(RyderCommand.CoalesceRequestClient, namespace, {
                  requests: pendingCommandQueue,
                })
              )
            )
          );
          // Clear `pendingCommandQueue` array in a mutable way
          pendingCommandQueue.splice(0, pendingCommandQueue.length);
        } else {
          let payload: ClientPayload | undefined;
          while ((payload = pendingCommandQueue.shift())) {
            target.postMessage(JSON.stringify(serializer(payload)));
          }
        }
      } else {
        // Throw an error if the number of commands hit the upper limit
        if (pendingCommandQueue.length > MAX_QUEUED_COMMANDS) {
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
          noHandlerForRequestIdWarning(clientRequestId, namespace);
        }

        break;
      }
      case RyderCommand.InvokeServerError: {
        const promiseHandler = invokeRequestIdPromiseMap.get(clientRequestId);
        if (promiseHandler) {
          promiseHandler.reject(payload.reason);
          invokeRequestIdPromiseMap.delete(clientRequestId);
        } else {
          noHandlerForRequestIdWarning(clientRequestId, namespace);
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
    if (
      isRyderServerPayload(payload) &&
      isTargetNamespace(payload, namespace)
    ) {
      console.log(`[RyderClient] Payload:`, payload);
      switch (payload[RYDER_COMMAND_FIELD]) {
        case RyderCommand.CoalesceRequestServer: {
          const { responses } = payload;
          responses.forEach(p => processPayload(event, p));
          break;
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
      const invokePayload = createPayload(
        RyderCommand.InvokeClient,
        namespace,
        {
          propertyPath,
          args,
        }
      );
      const { [RYDER_REQUEST_ID_FIELD]: requestId } = invokePayload;
      console.log(`[Invoke] Request Id: ${requestId}`);
      pendingCommandQueue.push(invokePayload);
      return new Promise((resolve, reject) => {
        invokeRequestIdPromiseMap.set(requestId, { resolve, reject });
        flushPendingCommandQueue();
      });
    },
    subscribe(propertyPath: PropertyKey[], onChange: (value: any) => void) {
      const subscribePayload = createPayload(
        RyderCommand.SubscribeClient,
        namespace,
        {
          propertyPath,
        }
      );
      const { [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId } =
        subscribePayload;
      subscriptionRequestIdMap.set(subscriptionRequestId, onChange);
      pendingCommandQueue.push(subscribePayload);
      flushPendingCommandQueue();
      return () => {
        const unsubscribePayload = createPayload(
          RyderCommand.UnsubscribeClient,
          namespace,
          {
            subscriptionRequestId,
            propertyPath,
          }
        );
        pendingCommandQueue.push(unsubscribePayload);
        flushPendingCommandQueue();
        subscriptionRequestIdMap.delete(subscriptionRequestId);
      };
    },
    messageHandler: serverPayloadHandler,
  };
}
