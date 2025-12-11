import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RYDER_COMMAND_FIELD, RYDER_NAMESPACE_FIELD, RYDER_REQUEST_ID_FIELD, RyderCommand } from '../src/constants';
import { createServerBridge } from '../src/server';
import { createPayload, defaultSerializer } from '../src/utils';
import { createTestEvent, MockMessageSource } from './mock-message-source';

describe('createServerBridge', () => {
  let clientSource: MockMessageSource;

  beforeEach(() => {
    clientSource = new MockMessageSource();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create a server bridge with required options', () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      expect(bridge).toBeDefined();
      expect(bridge.sendDiscoveryMessage).toBeInstanceOf(Function);
      expect(bridge.messageHandler).toBeInstanceOf(Function);
    });

    it('should accept custom serializer and deserializer', () => {
      const customSerializer = vi.fn((v) => JSON.stringify(v));
      const customDeserializer = vi.fn((v) => JSON.parse(v));

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
        serializer: customSerializer,
        deserializer: customDeserializer,
      });

      expect(bridge).toBeDefined();
    });
  });

  describe('sendDiscoveryMessage', () => {
    it('should send discovery message to all sources', () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const source1 = new MockMessageSource();
      const source2 = new MockMessageSource();

      bridge.sendDiscoveryMessage([source1, source2]);

      expect(source1.postedMessages.length).toBe(1);
      expect(source2.postedMessages.length).toBe(1);

      const payload1 = source1.getLastMessageParsed<any>();
      expect(payload1[RYDER_COMMAND_FIELD]).toBe(RyderCommand.DiscoveryServer);
      expect(payload1[RYDER_NAMESPACE_FIELD]).toBe('*');
    });

    it('should use custom namespace for discovery', () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const source = new MockMessageSource();
      bridge.sendDiscoveryMessage([source], 'custom-ns');

      const payload = source.getLastMessageParsed<any>();
      expect(payload[RYDER_NAMESPACE_FIELD]).toBe('custom-ns');
    });
  });

  describe('invoke handling', () => {
    it('should call invokeHandler with property path', async () => {
      const invokeHandler = vi.fn().mockReturnValue('result value');

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['getData'],
        args: [],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      expect(invokeHandler).toHaveBeenCalledWith(['getData']);
    });

    it('should invoke function with args when handler returns function', async () => {
      const mockFn = vi.fn().mockResolvedValue('function result');
      const invokeHandler = vi.fn().mockReturnValue(mockFn);

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['myFunction'],
        args: ['arg1', 'arg2'],
      });

      vi.useRealTimers();
      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should send success response', async () => {
      const invokeHandler = vi.fn().mockReturnValue(42);

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['value'],
        args: [],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      expect(clientSource.postedMessages.length).toBe(1);
      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeServerSuccess);
      expect(response.value).toBe(42);
      expect(response[RYDER_REQUEST_ID_FIELD]).toBe(invokePayload[RYDER_REQUEST_ID_FIELD]);
    });

    it('should send error response when handler throws', async () => {
      const invokeHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['failing'],
        args: [],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeServerError);
      expect(response.reason).toBe('Handler error');
    });

    it('should send error response with string reason for non-Error throws', async () => {
      const invokeHandler = vi.fn().mockImplementation(() => {
        throw 'string error';
      });

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['failing'],
        args: [],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeServerError);
      expect(response.reason).toBe('string error');
    });
  });

  describe('subscription handling', () => {
    it('should call subscriptionHandler with propertyPath and callback', async () => {
      const unsubscribe = vi.fn();
      const subscriptionHandler = vi.fn().mockReturnValue(unsubscribe);

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['counter'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload), clientSource));

      expect(subscriptionHandler).toHaveBeenCalledWith(['counter'], expect.any(Function));
    });

    it('should send success response on subscription', async () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['data'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload), clientSource));

      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.SubscribeServerSuccess);
      expect(response[RYDER_REQUEST_ID_FIELD]).toBe(subscribePayload[RYDER_REQUEST_ID_FIELD]);
    });

    it('should send updates to subscriber when value changes', async () => {
      let valueChangeCallback: ((value: unknown) => void) | null = null;

      const subscriptionHandler = vi.fn((propertyPath, onValueChange) => {
        valueChangeCallback = onValueChange;
        return vi.fn();
      });

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['counter'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload), clientSource));

      clientSource.clearMessages();

      // Simulate value change
      valueChangeCallback!(42);

      expect(clientSource.postedMessages.length).toBe(1);
      const update = clientSource.getLastMessageParsed<any>();
      expect(update[RYDER_COMMAND_FIELD]).toBe(RyderCommand.SubscribeServerUpdate);
      expect(update.value).toBe(42);
    });

    it('should not create duplicate subscriptions for same property path', async () => {
      const unsubscribe = vi.fn();
      const subscriptionHandler = vi.fn().mockReturnValue(unsubscribe);

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const client1 = new MockMessageSource();
      const client2 = new MockMessageSource();

      const subscribePayload1 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['shared', 'data'],
      });

      const subscribePayload2 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['shared', 'data'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload1), client1));
      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload2), client2));

      // subscriptionHandler should only be called once
      expect(subscriptionHandler).toHaveBeenCalledTimes(1);
    });

    it('should send updates to all subscribers', async () => {
      let valueChangeCallback: ((value: unknown) => void) | null = null;

      const subscriptionHandler = vi.fn((propertyPath, onValueChange) => {
        valueChangeCallback = onValueChange;
        return vi.fn();
      });

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const client1 = new MockMessageSource();
      const client2 = new MockMessageSource();

      const subscribePayload1 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['data'],
      });

      const subscribePayload2 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['data'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload1), client1));
      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload2), client2));

      client1.clearMessages();
      client2.clearMessages();

      valueChangeCallback!('new value');

      expect(client1.postedMessages.length).toBe(1);
      expect(client2.postedMessages.length).toBe(1);
    });
  });

  describe('unsubscribe handling', () => {
    it('should call unsubscribe when last listener unsubscribes', async () => {
      const unsubscribe = vi.fn();
      const subscriptionHandler = vi.fn().mockReturnValue(unsubscribe);

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['counter'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload), clientSource));

      const unsubscribePayload = createPayload(RyderCommand.UnsubscribeClient, 'test', {
        propertyPath: ['counter'],
        subscriptionRequestId: subscribePayload[RYDER_REQUEST_ID_FIELD],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(unsubscribePayload), clientSource));

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should not call unsubscribe when other listeners remain', async () => {
      const unsubscribe = vi.fn();
      const subscriptionHandler = vi.fn().mockReturnValue(unsubscribe);

      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler,
      });

      const client1 = new MockMessageSource();
      const client2 = new MockMessageSource();

      const subscribePayload1 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['data'],
      });

      const subscribePayload2 = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['data'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload1), client1));
      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload2), client2));

      // Unsubscribe first client
      const unsubscribePayload = createPayload(RyderCommand.UnsubscribeClient, 'test', {
        propertyPath: ['data'],
        subscriptionRequestId: subscribePayload1[RYDER_REQUEST_ID_FIELD],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(unsubscribePayload), client1));

      // Unsubscribe should not be called yet
      expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('should send success response on unsubscribe', async () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'test', {
        propertyPath: ['counter'],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(subscribePayload), clientSource));

      clientSource.clearMessages();

      const unsubscribePayload = createPayload(RyderCommand.UnsubscribeClient, 'test', {
        propertyPath: ['counter'],
        subscriptionRequestId: subscribePayload[RYDER_REQUEST_ID_FIELD],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(unsubscribePayload), clientSource));

      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.UnsubscribeServerSuccess);
    });
  });

  describe('coalesced requests', () => {
    it('should process coalesced requests and return coalesced response', async () => {
      const invokeHandler = vi.fn((path) => {
        if (path[0] === 'method1') return 'result1';
        if (path[0] === 'method2') return 'result2';
        return null;
      });

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const request1 = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['method1'],
        args: [],
      });

      const request2 = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['method2'],
        args: [],
      });

      const coalescedPayload = createPayload(RyderCommand.CoalesceRequestClient, 'test', {
        requests: [request1, request2],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(coalescedPayload), clientSource));

      expect(clientSource.postedMessages.length).toBe(1);
      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.CoalesceRequestServer);
      expect(response.responses.length).toBe(2);
      expect(response.responses[0].value).toBe('result1');
      expect(response.responses[1].value).toBe('result2');
    });
  });

  describe('retry on error', () => {
    it('should retry invoke when retryOnError is configured', async () => {
      const invokeHandler = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('first fail');
        })
        .mockReturnValue('success');

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
        retryOnError: { limit: 2, interval: 10 },
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['getData'],
        args: [],
      });

      vi.useRealTimers();
      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), clientSource));

      expect(invokeHandler).toHaveBeenCalledTimes(2);
      const response = clientSource.getLastMessageParsed<any>();
      expect(response[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeServerSuccess);
    });
  });

  describe('error handling', () => {
    it('should ignore invalid JSON messages', async () => {
      const bridge = createServerBridge({
        invokeHandler: vi.fn(),
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      await expect(bridge.messageHandler(createTestEvent('not valid json', clientSource))).resolves.not.toThrow();
    });

    it('should ignore non-Ryder messages', async () => {
      const invokeHandler = vi.fn();

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      await bridge.messageHandler(createTestEvent(JSON.stringify({ random: 'data' }), clientSource));

      expect(invokeHandler).not.toHaveBeenCalled();
    });

    it('should ignore messages without source', async () => {
      const invokeHandler = vi.fn();

      const bridge = createServerBridge({
        invokeHandler,
        subscriptionHandler: vi.fn(() => vi.fn()),
      });

      const invokePayload = createPayload(RyderCommand.InvokeClient, 'test', {
        propertyPath: ['test'],
        args: [],
      });

      await bridge.messageHandler(createTestEvent(defaultSerializer(invokePayload), null));

      expect(invokeHandler).not.toHaveBeenCalled();
    });
  });
});
