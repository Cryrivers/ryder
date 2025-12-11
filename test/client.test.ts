import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClientBridge } from '../src/client';
import { RYDER_COMMAND_FIELD, RYDER_NAMESPACE_FIELD, RYDER_REQUEST_ID_FIELD, RyderCommand } from '../src/constants';
import { createPayload, defaultSerializer } from '../src/utils';
import { MockMessageSource } from './mock-message-source';

describe('createClientBridge', () => {
  let clientSource: MockMessageSource;
  let serverSource: MockMessageSource;

  beforeEach(() => {
    clientSource = new MockMessageSource();
    serverSource = new MockMessageSource();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create a client bridge with default options', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
      });

      expect(bridge).toBeDefined();
      expect(bridge.invoke).toBeInstanceOf(Function);
      expect(bridge.subscribe).toBeInstanceOf(Function);
      expect(bridge.messageHandler).toBeInstanceOf(Function);
    });

    it('should throw error when namespace is asterisk', () => {
      expect(() =>
        createClientBridge({
          serverFinder: () => serverSource,
          namespace: '*',
        }),
      ).toThrow('Asterisk (*) is a wildcard character and matches all namespaces.');
    });

    it('should accept custom serializer and deserializer', () => {
      const customSerializer = vi.fn((v) => JSON.stringify(v));
      const customDeserializer = vi.fn((v) => JSON.parse(v));

      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        serializer: customSerializer,
        deserializer: customDeserializer,
      });

      expect(bridge).toBeDefined();
    });
  });

  describe('invoke', () => {
    it('should create invoke payload and return a promise', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      const invokePromise = bridge.invoke(['getData'], 'arg1', 'arg2');

      expect(invokePromise).toBeInstanceOf(Promise);
      expect(serverSource.postedMessages.length).toBe(1);
    });

    it('should send correct payload structure', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      bridge.invoke(['myFunction'], 42);

      // The payload is double serialized due to a bug in the source - the inner JSON.stringify
      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const payload = JSON.parse(innerMessage);

      expect(payload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeClient);
      expect(payload.propertyPath).toEqual(['myFunction']);
      expect(payload.args).toEqual([42]);
    });

    it('should resolve promise when server responds with success', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'test',
      });

      const invokePromise = bridge.invoke(['getData']);

      // Get the request ID from the sent message
      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const sentPayload = JSON.parse(innerMessage);
      const requestId = sentPayload[RYDER_REQUEST_ID_FIELD];

      // Simulate server response
      const responsePayload = createPayload(
        RyderCommand.InvokeServerSuccess,
        'test',
        { value: 'result data' },
        requestId,
      );

      vi.useRealTimers();
      bridge.messageHandler({
        data: defaultSerializer(responsePayload),
        source: serverSource,
      } as MessageEvent<string>);

      const result = await invokePromise;
      expect(result).toBe('result data');
    });

    it('should reject promise when server responds with error', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'test',
      });

      const invokePromise = bridge.invoke(['getData']);

      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const sentPayload = JSON.parse(innerMessage);
      const requestId = sentPayload[RYDER_REQUEST_ID_FIELD];

      const responsePayload = createPayload(
        RyderCommand.InvokeServerError,
        'test',
        { reason: 'Something went wrong' },
        requestId,
      );

      vi.useRealTimers();
      bridge.messageHandler({
        data: defaultSerializer(responsePayload),
        source: serverSource,
      } as MessageEvent<string>);

      await expect(invokePromise).rejects.toBe('Something went wrong');
    });
  });

  describe('subscribe', () => {
    it('should create subscribe payload and return unsubscribe function', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      const onChange = vi.fn();
      const unsubscribe = bridge.subscribe(['counter'], onChange);

      expect(unsubscribe).toBeInstanceOf(Function);
      expect(serverSource.postedMessages.length).toBe(1);
    });

    it('should call onChange when server sends update', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'test',
      });

      const onChange = vi.fn();
      bridge.subscribe(['counter'], onChange);

      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const sentPayload = JSON.parse(innerMessage);
      const subscriptionRequestId = sentPayload[RYDER_REQUEST_ID_FIELD];

      const updatePayload = createPayload(
        RyderCommand.SubscribeServerUpdate,
        'test',
        { value: 42 },
        subscriptionRequestId,
      );

      bridge.messageHandler({
        data: defaultSerializer(updatePayload),
        source: serverSource,
      } as MessageEvent<string>);

      expect(onChange).toHaveBeenCalledWith(42);
    });

    it('should send unsubscribe payload when unsubscribe is called', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      const unsubscribe = bridge.subscribe(['counter'], vi.fn());
      serverSource.clearMessages();

      unsubscribe();

      expect(serverSource.postedMessages.length).toBe(1);
      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const payload = JSON.parse(innerMessage);
      expect(payload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.UnsubscribeClient);
    });

    it('should throw error for update on non-existent subscription', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'test',
      });

      const updatePayload = createPayload(RyderCommand.SubscribeServerUpdate, 'test', { value: 42 }, 'non-existent-id');

      expect(() =>
        bridge.messageHandler({
          data: defaultSerializer(updatePayload),
          source: serverSource,
        } as MessageEvent<string>),
      ).toThrow("Potential memory leaking at RyderServer. Subscription for non-existent-id doesn't exist.");
    });
  });

  describe('request coalescing', () => {
    it('should batch multiple requests when coalescing is enabled', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: true,
      });

      bridge.invoke(['method1']);
      bridge.invoke(['method2']);
      bridge.invoke(['method3']);

      // Coalescing happens on setTimeout(0), so advance timers
      await vi.advanceTimersByTimeAsync(0);

      expect(serverSource.postedMessages.length).toBe(1);

      const payload = serverSource.getLastMessageParsed<any>();
      expect(payload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.CoalesceRequestClient);
      expect(payload.requests.length).toBe(3);
    });

    it('should send requests individually when coalescing is disabled', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      bridge.invoke(['method1']);
      bridge.invoke(['method2']);

      expect(serverSource.postedMessages.length).toBe(2);
    });

    it('should process coalesced server responses', async () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: true,
        namespace: 'test',
      });

      const promise1 = bridge.invoke(['method1']);
      const promise2 = bridge.invoke(['method2']);

      await vi.advanceTimersByTimeAsync(0);

      const coalescedPayload = serverSource.getLastMessageParsed<any>();
      const request1Id = coalescedPayload.requests[0][RYDER_REQUEST_ID_FIELD];
      const request2Id = coalescedPayload.requests[1][RYDER_REQUEST_ID_FIELD];

      const response1 = createPayload(RyderCommand.InvokeServerSuccess, 'test', { value: 'result1' }, request1Id);
      const response2 = createPayload(RyderCommand.InvokeServerSuccess, 'test', { value: 'result2' }, request2Id);

      const coalescedResponse = createPayload(RyderCommand.CoalesceRequestServer, 'test', {
        responses: [response1, response2],
      });

      vi.useRealTimers();
      bridge.messageHandler({
        data: defaultSerializer(coalescedResponse),
        source: serverSource,
      } as MessageEvent<string>);

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });
  });

  describe('server discovery', () => {
    it('should set target from discovery message when serverFinder is false', () => {
      const bridge = createClientBridge({
        serverFinder: false,
        requestCoalescing: false,
        namespace: 'test',
      });

      const discoveryPayload = createPayload(RyderCommand.DiscoveryServer, '*', {});

      bridge.messageHandler({
        data: defaultSerializer(discoveryPayload),
        source: serverSource,
      } as MessageEvent<string>);

      // Now invoke should work and use the discovered server
      bridge.invoke(['test']);

      expect(serverSource.postedMessages.length).toBe(1);
    });

    it('should ignore discovery message when serverFinder is provided', () => {
      const differentServer = new MockMessageSource();
      const bridge = createClientBridge({
        serverFinder: () => differentServer,
        requestCoalescing: false,
        namespace: 'test',
      });

      const discoveryPayload = createPayload(RyderCommand.DiscoveryServer, '*', {});

      bridge.messageHandler({
        data: defaultSerializer(discoveryPayload),
        source: serverSource,
      } as MessageEvent<string>);

      // Invoke should use serverFinder's server, not the discovery source
      bridge.invoke(['test']);

      expect(differentServer.postedMessages.length).toBe(1);
      expect(serverSource.postedMessages.length).toBe(0);
    });
  });

  describe('namespace filtering', () => {
    it('should process messages matching namespace', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'my-namespace',
      });

      const onChange = vi.fn();
      bridge.subscribe(['data'], onChange);

      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const sentPayload = JSON.parse(innerMessage);
      const subId = sentPayload[RYDER_REQUEST_ID_FIELD];

      const updatePayload = createPayload(RyderCommand.SubscribeServerUpdate, 'my-namespace', { value: 123 }, subId);

      bridge.messageHandler({
        data: defaultSerializer(updatePayload),
        source: serverSource,
      } as MessageEvent<string>);

      expect(onChange).toHaveBeenCalledWith(123);
    });

    it('should ignore messages for different namespace', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'my-namespace',
      });

      const onChange = vi.fn();
      bridge.subscribe(['data'], onChange);

      const outerMessage = serverSource.getLastMessage();
      const innerMessage = JSON.parse(outerMessage!);
      const sentPayload = JSON.parse(innerMessage);
      const subId = sentPayload[RYDER_REQUEST_ID_FIELD];

      const updatePayload = createPayload(
        RyderCommand.SubscribeServerUpdate,
        'different-namespace',
        { value: 123 },
        subId,
      );

      bridge.messageHandler({
        data: defaultSerializer(updatePayload),
        source: serverSource,
      } as MessageEvent<string>);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should process wildcard namespace messages', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
        namespace: 'specific',
      });

      const discoveryPayload = createPayload(RyderCommand.DiscoveryServer, '*', {});

      // Should not throw - wildcard matches any namespace
      bridge.messageHandler({
        data: defaultSerializer(discoveryPayload),
        source: serverSource,
      } as MessageEvent<string>);
    });
  });

  describe('error handling', () => {
    it('should ignore invalid JSON messages', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      expect(() =>
        bridge.messageHandler({
          data: 'not valid json',
          source: serverSource,
        } as MessageEvent<string>),
      ).not.toThrow();
    });

    it('should ignore non-Ryder messages', () => {
      const bridge = createClientBridge({
        serverFinder: () => serverSource,
        requestCoalescing: false,
      });

      expect(() =>
        bridge.messageHandler({
          data: JSON.stringify({ random: 'data' }),
          source: serverSource,
        } as MessageEvent<string>),
      ).not.toThrow();
    });
  });
});
