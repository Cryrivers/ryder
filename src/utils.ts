import { nanoid } from 'nanoid/non-secure';
import {
  RYDER_COMMAND_FIELD,
  RyderCommand,
  RYDER_REQUEST_ID_FIELD,
  RYDER_VERSION_FIELD,
  RyderClientCommands,
  RyderServerCommands,
  PROTOCOL_VERSION,
  RYDER_NAMESPACE_FIELD,
} from './constants';

interface RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand;
  [RYDER_REQUEST_ID_FIELD]: string;
  [RYDER_VERSION_FIELD]: number;
  [RYDER_NAMESPACE_FIELD]: string;
}

interface InvokeClientPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeClient;
  propertyPath: PropertyKey[];
  args: unknown[];
}

interface InvokeServerSuccessPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerSuccess;
  value: unknown;
}

interface InvokeServerErrorPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerError;
  reason: unknown;
}

interface SubscribeClientPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeClient;
  propertyPath: PropertyKey[];
}

interface SubscribeServerSuccessPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerSuccess;
}

interface SubscribeServerErrorPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerError;
}

interface SubscribeServerUpdatePayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerUpdate;
  value: unknown;
}

interface UnsubscribeClientPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeClient;
  propertyPath: PropertyKey[];
  subscriptionRequestId: string;
}

interface UnsubscribeServerSuccessPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeServerSuccess;
}

interface UnsubscribeServerErrorPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeServerError;
}

interface DiscoveryServerPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.DiscoveryServer;
}

interface CoalesceRequestClientPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.CoalesceRequestClient;
  requests: ClientPayloadNoCoalescingRequest[];
}

interface CoalesceRequestServerPayload extends RyderPayloadCommonFields {
  [RYDER_COMMAND_FIELD]: RyderCommand.CoalesceRequestServer;
  responses: ServerPayloadNoCoalescingRequest[];
}

export type ClientPayloadNoCoalescingRequest =
  | InvokeClientPayload
  | SubscribeClientPayload
  | UnsubscribeClientPayload;

type ServerPayloadNoCoalescingRequest =
  | InvokeServerErrorPayload
  | InvokeServerSuccessPayload
  | SubscribeServerSuccessPayload
  | SubscribeServerErrorPayload
  | SubscribeServerUpdatePayload
  | UnsubscribeServerSuccessPayload
  | UnsubscribeServerErrorPayload
  | DiscoveryServerPayload;

export type ClientPayload =
  | ClientPayloadNoCoalescingRequest
  | CoalesceRequestClientPayload;

export type ServerPayload =
  | ServerPayloadNoCoalescingRequest
  | CoalesceRequestServerPayload;

/**
 * @internal
 */
const generateRequestId = () => nanoid(10);

export function createPayload<T extends RyderCommand>(
  command: T,
  namespace: string,
  payload: Omit<
    Extract<ClientPayload | ServerPayload, { [RYDER_COMMAND_FIELD]: T }>,
    keyof RyderPayloadCommonFields
  >,
  requestId?: string
) {
  const _requestId = requestId || generateRequestId();
  return {
    [RYDER_COMMAND_FIELD]: command,
    [RYDER_REQUEST_ID_FIELD]: _requestId,
    [RYDER_VERSION_FIELD]: PROTOCOL_VERSION,
    [RYDER_NAMESPACE_FIELD]: namespace,
    ...payload,
  } as Extract<ClientPayload | ServerPayload, { [RYDER_COMMAND_FIELD]: T }>;
}

/**
 * @internal
 */
export const generateSubscriptionKey = (propertyPath: PropertyKey[]) =>
  propertyPath.join('_');

function isRyderPayload(
  payload: unknown
): payload is ClientPayload | ServerPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    RYDER_COMMAND_FIELD in payload &&
    RYDER_REQUEST_ID_FIELD in payload &&
    RYDER_VERSION_FIELD in payload &&
    RYDER_NAMESPACE_FIELD in payload
  );
}

function matchVersion(version: number) {
  const match = version === PROTOCOL_VERSION;
  if (!match) {
    console.log(
      `Mismatched Ryder Protocol Version ${version}. Expected 0.0.2.`
    );
  }
  return match;
}

export function isRyderClientPayload(
  payload: unknown
): payload is ClientPayload {
  return (
    isRyderPayload(payload) &&
    RyderClientCommands.includes(payload[RYDER_COMMAND_FIELD]) &&
    matchVersion(payload[RYDER_VERSION_FIELD])
  );
}

export function isRyderServerPayload(
  payload: unknown
): payload is ServerPayload {
  return (
    isRyderPayload(payload) &&
    RyderServerCommands.includes(payload[RYDER_COMMAND_FIELD]) &&
    matchVersion(payload[RYDER_VERSION_FIELD])
  );
}

export function isTargetNamespace(payload: ServerPayload, namespace: string) {
  return (
    payload[RYDER_NAMESPACE_FIELD] === namespace ||
    payload[RYDER_NAMESPACE_FIELD] === '*'
  );
}

export function noProcessing<T>(value: T) {
  return value;
}

function timeout(timeout: number) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

export async function retry<T>(
  action: () => T,
  retryLimit: number,
  retryTimeout: number
) {
  let tryCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await action();
    } catch (ex) {
      tryCount++;
      if (tryCount > retryLimit) {
        throw ex;
      } else {
        await timeout(retryTimeout);
      }
    }
  }
}
