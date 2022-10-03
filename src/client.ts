import {
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
  RyderCommand,
} from './constants';
import {
  ClientPayload,
  InvokeClientPayload,
  SubscribeClientPayload,
  UnsubscribeClientPayload,
} from './typings';
import { generateRequestId, isRyderServerPayload, noProcessing } from './utils';

const MAX_QUEUED_COMMANDS = 100;

export function createClientBridge(options: {
  serverFinder: (() => MessageEventSource | null) | false; // Passive Mode if false
  serializer?: (value: unknown) => unknown;
  deserializer?: (value: unknown) => unknown;
}) {
  const {
    serverFinder,
    serializer = noProcessing,
    deserializer = noProcessing,
  } = options;

  let target: MessageEventSource | null = null;
  const pendingCommandQueue: ClientPayload[] = [];
  const subscriptionRequestIdMap = new Map<string, (value: unknown) => void>();
  const invokeRequestIdPromiseMap = new Map<
    string,
    {
      resolve: (value?: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  function optimizeCommandQueue() {
    if (pendingCommandQueue.length <= 1) {
      // No commands or only one command. No
      // need to optimise
      return;
    }
    // Negate Subscribe / Unsubscribe with the same request id, removing both from the queue

    // TODO: To be implemented

    // Coalesce multiple invokes with the same param into 1 message

    // TODO: To be implemented
  }

  function flushPendingCommandQueue() {
    if (serverFinder && !target) {
      // Active Mode (Client actively searching for Server)
      // Call `serverFinder` see if we can find a server
      target = serverFinder();
    }

    if (target) {
      // Optimise the pending command queue
      optimizeCommandQueue();
      for (const payload of pendingCommandQueue) {
        target.postMessage(JSON.stringify(serializer(payload)));
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
          const promiseHandler = invokeRequestIdPromiseMap.get(
            payload[RYDER_REQUEST_ID_FIELD]
          );
          if (promiseHandler) {
            promiseHandler.resolve(payload.value);
            invokeRequestIdPromiseMap.delete(payload[RYDER_REQUEST_ID_FIELD]);
          } else {
            throw new Error(
              `Unable to find handler for request id: ${payload[RYDER_REQUEST_ID_FIELD]}`
            );
          }

          break;
        }
        case RyderCommand.InvokeServerError: {
          const promiseHandler = invokeRequestIdPromiseMap.get(
            payload[RYDER_REQUEST_ID_FIELD]
          );
          if (promiseHandler) {
            promiseHandler.reject(payload.reason);
            invokeRequestIdPromiseMap.delete(payload[RYDER_REQUEST_ID_FIELD]);
          } else {
            throw new Error(
              `Unable to find handler for request id: ${payload[RYDER_REQUEST_ID_FIELD]}`
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
    } else {
      // Ignore this message
      // It shouldn't come from Ryder
    }
  }

  return {
    invoke(propertyPath: PropertyKey[], ...args: unknown[]) {
      const requestId = generateRequestId();
      console.log(`[Invoke] Request Id: ${requestId}`);

      pendingCommandQueue.push({
        [RYDER_COMMAND_FIELD]: RyderCommand.InvokeClient,
        [RYDER_REQUEST_ID_FIELD]: requestId,
        propertyPath,
        args,
      } as InvokeClientPayload);

      return new Promise((resolve, reject) => {
        invokeRequestIdPromiseMap.set(requestId, { resolve, reject });
        flushPendingCommandQueue();
      });
    },
    subscribe(propertyPath: PropertyKey[], onChange: (value: any) => void) {
      const subscriptionRequestId = generateRequestId();
      subscriptionRequestIdMap.set(subscriptionRequestId, onChange);

      pendingCommandQueue.push({
        [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeClient,
        [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId,
        propertyPath,
      } as SubscribeClientPayload);
      flushPendingCommandQueue();

      return () => {
        const requestId = generateRequestId();
        pendingCommandQueue.push({
          [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeClient,
          [RYDER_REQUEST_ID_FIELD]: requestId,
          subscriptionRequestId: subscriptionRequestId,
          propertyPath,
        } as UnsubscribeClientPayload);
        flushPendingCommandQueue();
        subscriptionRequestIdMap.delete(subscriptionRequestId);
      };
    },
    messageHandler: serverPayloadHandler,
  };
}
