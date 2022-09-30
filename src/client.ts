import {
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
  RyderCommand,
} from './constants';
import {
  InvokeClientPayload,
  SubscribeClientPayload,
  UnsubscribeClientPayload,
} from './typings';
import { generateRequestId, isRyderServerPayload, noProcessing } from './utils';

export function createClientBridge(options: {
  serverFinder: () => MessageEventSource;
  serializer?: (value: unknown) => unknown;
  deserializer?: (value: unknown) => unknown;
}) {
  const {
    serverFinder,
    serializer = noProcessing,
    deserializer = noProcessing,
  } = options;
  const subscriptionRequestIdMap = new Map<string, (value: unknown) => void>();
  const invokeRequestIdPromiseMap = new Map<
    string,
    {
      resolve: (value?: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

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
      const target = serverFinder();
      console.log(`[Invoke] Request Id: ${requestId}`);
      target.postMessage(
        JSON.stringify(
          serializer({
            [RYDER_COMMAND_FIELD]: RyderCommand.InvokeClient,
            [RYDER_REQUEST_ID_FIELD]: requestId,
            propertyPath,
            args,
          } as InvokeClientPayload)
        )
      );

      return new Promise((resolve, reject) => {
        invokeRequestIdPromiseMap.set(requestId, { resolve, reject });
      });
    },
    subscribe(propertyPath: PropertyKey[], onChange: (value: any) => void) {
      const target = serverFinder();
      const subscriptionRequestId = generateRequestId();
      subscriptionRequestIdMap.set(subscriptionRequestId, onChange);
      target.postMessage(
        JSON.stringify(
          serializer({
            [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeClient,
            [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId,
            propertyPath,
          } as SubscribeClientPayload)
        )
      );

      return () => {
        const requestId = generateRequestId();
        target.postMessage(
          JSON.stringify(
            serializer({
              [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeClient,
              [RYDER_REQUEST_ID_FIELD]: requestId,
              subscriptionRequestId: subscriptionRequestId,
              propertyPath,
            } as UnsubscribeClientPayload)
          )
        );
        subscriptionRequestIdMap.delete(subscriptionRequestId);
      };
    },
    messageHandler: serverPayloadHandler,
  };
}
