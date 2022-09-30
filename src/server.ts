import {
  RyderCommand,
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
} from './constants';
import {
  InvokeServerErrorPayload,
  InvokeServerSuccessPayload,
  SubscribeServerSuccessPayload,
  SubscribeServerUpdatePayload,
  UnsubscribeServerSuccessPayload,
} from './typings';
import { isRyderClientPayload, noProcessing } from './utils';

export function createServerBridge(options: {
  serializer?: (value: unknown) => unknown;
  deserializer?: (value: unknown) => unknown;
  invokeHandler: (
    propertyPath: PropertyKey[],
    args: unknown[]
  ) => Promise<unknown>;
  subscriptionHandler: (
    propertyPath: PropertyKey[],
    onValueChange: (value: unknown) => void
  ) => () => void;
}) {
  const {
    serializer = noProcessing,
    deserializer = noProcessing,
    invokeHandler,
    subscriptionHandler,
  } = options;
  const subscriptionManager = new Map<
    string,
    {
      unsubscribe: () => void;
      listeners: {
        source: MessageEventSource;
        subscriptionRequestId: string;
      }[];
    }
  >();

  async function clientPayloadHandler(event: MessageEvent<string>) {
    const { data, source } = event;
    let payload: unknown;
    try {
      payload = deserializer(JSON.parse(data));
    } catch {
      // Unable to parse and deserialize the message. just ignore
      return;
    }

    if (isRyderClientPayload(payload) && source) {
      console.log(`[RyderServer] Payload:`, payload);
      switch (payload[RYDER_COMMAND_FIELD]) {
        case RyderCommand.InvokeClient: {
          const { propertyPath, args } = payload;
          const requestId = payload[RYDER_REQUEST_ID_FIELD];
          try {
            const value = await invokeHandler(propertyPath, args);
            console.log(`[InvokeSuccess]: ${requestId}`);
            source.postMessage(
              JSON.stringify(
                serializer({
                  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerSuccess,
                  [RYDER_REQUEST_ID_FIELD]: requestId,
                  value,
                } as InvokeServerSuccessPayload)
              )
            );
          } catch (ex) {
            const reason = ex instanceof Error ? ex.message : String(ex);
            source.postMessage(
              JSON.stringify(
                serializer({
                  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerError,
                  [RYDER_REQUEST_ID_FIELD]: requestId,
                  reason,
                } as InvokeServerErrorPayload)
              )
            );
          }
          break;
        }
        case RyderCommand.SubscribeClient: {
          const { propertyPath } = payload;
          const subscriptionKey = propertyPath.join('_');
          const sub = subscriptionManager.get(subscriptionKey);
          const clientRequestId = payload[RYDER_REQUEST_ID_FIELD];
          if (sub) {
            sub.listeners.push({
              source,
              subscriptionRequestId: clientRequestId,
            });
          } else {
            const unsubscribe = subscriptionHandler(propertyPath, value => {
              // Send the value changes to all listeners
              const sub = subscriptionManager.get(subscriptionKey);
              if (sub) {
                sub.listeners.forEach(({ source, subscriptionRequestId }) =>
                  source.postMessage(
                    JSON.stringify(
                      serializer({
                        [RYDER_COMMAND_FIELD]:
                          RyderCommand.SubscribeServerUpdate,
                        [RYDER_REQUEST_ID_FIELD]: subscriptionRequestId,
                        value,
                      } as SubscribeServerUpdatePayload)
                    )
                  )
                );
              } else {
                // Potential Memory Leaking
                // need to log the error
              }
            });
            subscriptionManager.set(subscriptionKey, {
              unsubscribe,
              listeners: [{ source, subscriptionRequestId: clientRequestId }],
            });
          }
          source.postMessage(
            JSON.stringify(
              serializer({
                [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerSuccess,
                [RYDER_REQUEST_ID_FIELD]: clientRequestId,
              } as SubscribeServerSuccessPayload)
            )
          );
          break;
        }
        case RyderCommand.UnsubscribeClient: {
          const { propertyPath, subscriptionRequestId } = payload;
          const subscriptionKey = propertyPath.join('_');
          const sub = subscriptionManager.get(subscriptionKey);

          if (sub) {
            if (sub.listeners.length === 1) {
              const unsubscribe = sub.unsubscribe;
              const listener = sub.listeners[0];
              if (listener.subscriptionRequestId === subscriptionRequestId) {
                unsubscribe();
                subscriptionManager.delete(subscriptionKey);
                listener.source.postMessage(
                  JSON.stringify(
                    serializer({
                      [RYDER_COMMAND_FIELD]:
                        RyderCommand.UnsubscribeServerSuccess,
                      [RYDER_REQUEST_ID_FIELD]: payload[RYDER_REQUEST_ID_FIELD],
                    } as UnsubscribeServerSuccessPayload)
                  )
                );
              } else {
                // Unable to get `source`
                // UnsubscribeError
              }
            } else {
              const itemToBeRemoved = sub.listeners.find(
                item => item.subscriptionRequestId === subscriptionRequestId
              );
              if (itemToBeRemoved) {
                sub.listeners = sub.listeners.filter(
                  item => item !== itemToBeRemoved
                );
                // UnsubscribeSuccess
                itemToBeRemoved.source.postMessage(
                  JSON.stringify(
                    serializer({
                      [RYDER_COMMAND_FIELD]:
                        RyderCommand.UnsubscribeServerSuccess,
                      [RYDER_REQUEST_ID_FIELD]: payload[RYDER_REQUEST_ID_FIELD],
                    } as UnsubscribeServerSuccessPayload)
                  )
                );
              } else {
                // Unable to get `source`
                //UnsubscribeError
              }
            }
          } else {
            // Unable to get `source`
            // UnsubscribeError
          }
        }
      }
    } else {
      // Ignore this message
      // It shouldn't come from Ryder
    }
  }

  return {
    messageHandler: clientPayloadHandler,
  };
}
