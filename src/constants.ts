/**
 * @internal
 * Do increase the number if RyderCommand changed
 * or the following payload spec has breaking changes
 */
export const PROTOCOL_VERSION = 0;

/* @internal */
export const enum RyderCommand {
  CoalesceRequestClient,
  CoalesceRequestServer,
  DiscoveryServer,
  InvokeClient,
  InvokeServerSuccess,
  InvokeServerError,
  SubscribeClient,
  SubscribeServerSuccess,
  SubscribeServerError,
  SubscribeServerUpdate,
  UnsubscribeClient,
  UnsubscribeServerSuccess,
  UnsubscribeServerError,
}

/* @internal */
export const RyderClientCommands = [
  RyderCommand.InvokeClient,
  RyderCommand.SubscribeClient,
  RyderCommand.UnsubscribeClient,
  RyderCommand.CoalesceRequestClient,
];

/* @internal */
export const RyderServerCommands = [
  RyderCommand.InvokeServerSuccess,
  RyderCommand.InvokeServerError,
  RyderCommand.SubscribeServerSuccess,
  RyderCommand.SubscribeServerUpdate,
  RyderCommand.SubscribeServerError,
  RyderCommand.UnsubscribeServerSuccess,
  RyderCommand.UnsubscribeServerError,
  RyderCommand.DiscoveryServer,
  RyderCommand.CoalesceRequestServer,
];

/* @internal */
export const RYDER_COMMAND_FIELD = '_RYDER_COMMAND';
/* @internal */
export const RYDER_REQUEST_ID_FIELD = '_RYDER_REQUEST_ID';
/* @internal */
export const RYDER_VERSION_FIELD = '_RYDER_VERSION';
/* @internal */
export const RYDER_NAMESPACE_FIELD = '_RYDER_NAMESPACE';
