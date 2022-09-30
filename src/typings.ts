import {
  RYDER_COMMAND_FIELD,
  RyderCommand,
  RYDER_REQUEST_ID_FIELD,
} from './constants';

interface RequestId {
  [RYDER_REQUEST_ID_FIELD]: string;
}

export interface InvokeClientPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeClient;
  propertyPath: PropertyKey[];
  args: unknown[];
}

export interface InvokeServerSuccessPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerSuccess;
  value: unknown;
}

export interface InvokeServerErrorPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.InvokeServerError;
  reason: unknown;
}

export interface SubscribeClientPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeClient;
  propertyPath: PropertyKey[];
}

export interface SubscribeServerSuccessPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerSuccess;
}

export interface SubscribeServerErrorPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerError;
}

export interface SubscribeServerUpdatePayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.SubscribeServerUpdate;
  value: unknown;
}

export interface UnsubscribeClientPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeClient;
  propertyPath: PropertyKey[];
  subscriptionRequestId: string;
}

export interface UnsubscribeServerSuccessPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeServerSuccess;
}

export interface UnsubscribeServerErrorPayload extends RequestId {
  [RYDER_COMMAND_FIELD]: RyderCommand.UnsubscribeServerError;
}

export type ClientPayload =
  | InvokeClientPayload
  | SubscribeClientPayload
  | UnsubscribeClientPayload;
export type ServerPayload =
  | InvokeServerErrorPayload
  | InvokeServerSuccessPayload
  | SubscribeServerSuccessPayload
  | SubscribeServerErrorPayload
  | SubscribeServerUpdatePayload
  | UnsubscribeServerSuccessPayload
  | UnsubscribeServerErrorPayload;
