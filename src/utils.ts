import { nanoid } from 'nanoid/non-secure';
import {
  RyderClientCommands,
  RyderServerCommands,
  RYDER_COMMAND_FIELD,
  RYDER_REQUEST_ID_FIELD,
} from './constants';
import { ClientPayload, ServerPayload } from './typings';

/**
 * @internal
 */
export const generateRequestId = () => nanoid(10);

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
    RYDER_REQUEST_ID_FIELD in payload
  );
}

export function isRyderClientPayload(
  payload: unknown
): payload is ClientPayload {
  return (
    isRyderPayload(payload) &&
    RyderClientCommands.includes(payload[RYDER_COMMAND_FIELD])
  );
}

export function isRyderServerPayload(
  payload: unknown
): payload is ServerPayload {
  return (
    isRyderPayload(payload) &&
    RyderServerCommands.includes(payload[RYDER_COMMAND_FIELD])
  );
}

export function noProcessing<T>(value: T) {
  return value;
}
