import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_VERSION,
  RYDER_COMMAND_FIELD,
  RYDER_NAMESPACE_FIELD,
  RYDER_REQUEST_ID_FIELD,
  RYDER_VERSION_FIELD,
  RyderCommand,
} from '../src/constants';
import {
  createPayload,
  defaultDeserializer,
  defaultSerializer,
  generateSubscriptionKey,
  isRyderClientPayload,
  isRyderServerPayload,
  isTargetNamespace,
  retry,
} from '../src/utils';

describe('utils', () => {
  describe('createPayload', () => {
    it('should create a payload with required fields', () => {
      const payload = createPayload(RyderCommand.InvokeClient, 'test-namespace', {
        propertyPath: ['foo', 'bar'],
        args: [1, 2, 3],
      });

      expect(payload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.InvokeClient);
      expect(payload[RYDER_NAMESPACE_FIELD]).toBe('test-namespace');
      expect(payload[RYDER_VERSION_FIELD]).toBe(PROTOCOL_VERSION);
      expect(payload[RYDER_REQUEST_ID_FIELD]).toBeDefined();
      expect(typeof payload[RYDER_REQUEST_ID_FIELD]).toBe('string');
      expect(payload.propertyPath).toEqual(['foo', 'bar']);
      expect(payload.args).toEqual([1, 2, 3]);
    });

    it('should use provided requestId when given', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'ns', { value: 42 }, 'custom-request-id');

      expect(payload[RYDER_REQUEST_ID_FIELD]).toBe('custom-request-id');
    });

    it('should generate unique request IDs', () => {
      const payload1 = createPayload(RyderCommand.InvokeClient, 'ns', { propertyPath: [], args: [] });
      const payload2 = createPayload(RyderCommand.InvokeClient, 'ns', { propertyPath: [], args: [] });

      expect(payload1[RYDER_REQUEST_ID_FIELD]).not.toBe(payload2[RYDER_REQUEST_ID_FIELD]);
    });

    it('should create different payload types correctly', () => {
      const subscribePayload = createPayload(RyderCommand.SubscribeClient, 'ns', {
        propertyPath: ['data'],
      });
      expect(subscribePayload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.SubscribeClient);

      const discoveryPayload = createPayload(RyderCommand.DiscoveryServer, '*', {});
      expect(discoveryPayload[RYDER_COMMAND_FIELD]).toBe(RyderCommand.DiscoveryServer);
    });
  });

  describe('isRyderClientPayload', () => {
    it('should return true for valid client payloads', () => {
      const payload = createPayload(RyderCommand.InvokeClient, 'ns', {
        propertyPath: ['test'],
        args: [],
      });

      expect(isRyderClientPayload(payload)).toBe(true);
    });

    it('should return true for SubscribeClient payload', () => {
      const payload = createPayload(RyderCommand.SubscribeClient, 'ns', {
        propertyPath: ['test'],
      });

      expect(isRyderClientPayload(payload)).toBe(true);
    });

    it('should return true for UnsubscribeClient payload', () => {
      const payload = createPayload(RyderCommand.UnsubscribeClient, 'ns', {
        propertyPath: ['test'],
        subscriptionRequestId: 'sub-1',
      });

      expect(isRyderClientPayload(payload)).toBe(true);
    });

    it('should return true for CoalesceRequestClient payload', () => {
      const payload = createPayload(RyderCommand.CoalesceRequestClient, 'ns', {
        requests: [],
      });

      expect(isRyderClientPayload(payload)).toBe(true);
    });

    it('should return false for server payloads', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'ns', {
        value: 42,
      });

      expect(isRyderClientPayload(payload)).toBe(false);
    });

    it('should return false for invalid payloads', () => {
      expect(isRyderClientPayload(null)).toBe(false);
      expect(isRyderClientPayload(undefined)).toBe(false);
      expect(isRyderClientPayload({})).toBe(false);
      expect(isRyderClientPayload({ foo: 'bar' })).toBe(false);
      expect(isRyderClientPayload('string')).toBe(false);
      expect(isRyderClientPayload(123)).toBe(false);
    });

    it('should return false for payload with wrong version', () => {
      const payload = {
        [RYDER_COMMAND_FIELD]: RyderCommand.InvokeClient,
        [RYDER_REQUEST_ID_FIELD]: 'test-id',
        [RYDER_VERSION_FIELD]: 999, // Wrong version
        [RYDER_NAMESPACE_FIELD]: 'ns',
        propertyPath: ['test'],
        args: [],
      };

      expect(isRyderClientPayload(payload)).toBe(false);
    });
  });

  describe('isRyderServerPayload', () => {
    it('should return true for valid server payloads', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'ns', {
        value: 42,
      });

      expect(isRyderServerPayload(payload)).toBe(true);
    });

    it('should return true for InvokeServerError payload', () => {
      const payload = createPayload(RyderCommand.InvokeServerError, 'ns', {
        reason: 'error',
      });

      expect(isRyderServerPayload(payload)).toBe(true);
    });

    it('should return true for DiscoveryServer payload', () => {
      const payload = createPayload(RyderCommand.DiscoveryServer, '*', {});

      expect(isRyderServerPayload(payload)).toBe(true);
    });

    it('should return true for SubscribeServerSuccess payload', () => {
      const payload = createPayload(RyderCommand.SubscribeServerSuccess, 'ns', {});

      expect(isRyderServerPayload(payload)).toBe(true);
    });

    it('should return true for SubscribeServerUpdate payload', () => {
      const payload = createPayload(RyderCommand.SubscribeServerUpdate, 'ns', {
        value: 'updated',
      });

      expect(isRyderServerPayload(payload)).toBe(true);
    });

    it('should return false for client payloads', () => {
      const payload = createPayload(RyderCommand.InvokeClient, 'ns', {
        propertyPath: ['test'],
        args: [],
      });

      expect(isRyderServerPayload(payload)).toBe(false);
    });

    it('should return false for invalid payloads', () => {
      expect(isRyderServerPayload(null)).toBe(false);
      expect(isRyderServerPayload(undefined)).toBe(false);
      expect(isRyderServerPayload({})).toBe(false);
    });
  });

  describe('isTargetNamespace', () => {
    it('should return true when namespaces match exactly', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'my-namespace', {
        value: 42,
      });

      expect(isTargetNamespace(payload, 'my-namespace')).toBe(true);
    });

    it('should return false when namespaces do not match', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'namespace-a', {
        value: 42,
      });

      expect(isTargetNamespace(payload, 'namespace-b')).toBe(false);
    });

    it('should return true when payload namespace is wildcard', () => {
      const payload = createPayload(RyderCommand.DiscoveryServer, '*', {});

      expect(isTargetNamespace(payload, 'any-namespace')).toBe(true);
      expect(isTargetNamespace(payload, '')).toBe(true);
      expect(isTargetNamespace(payload, 'test')).toBe(true);
    });

    it('should return false when target is wildcard but payload is not', () => {
      const payload = createPayload(RyderCommand.InvokeServerSuccess, 'specific', {
        value: 42,
      });

      expect(isTargetNamespace(payload, '*')).toBe(false);
    });
  });

  describe('generateSubscriptionKey', () => {
    it('should join property path with underscores', () => {
      expect(generateSubscriptionKey(['foo', 'bar', 'baz'])).toBe('foo_bar_baz');
    });

    it('should handle single element path', () => {
      expect(generateSubscriptionKey(['data'])).toBe('data');
    });

    it('should handle empty path', () => {
      expect(generateSubscriptionKey([])).toBe('');
    });

    it('should handle numeric keys', () => {
      expect(generateSubscriptionKey(['items', 0, 'value'])).toBe('items_0_value');
    });
  });

  describe('defaultSerializer', () => {
    it('should serialize to JSON string', () => {
      expect(defaultSerializer({ foo: 'bar' })).toBe('{"foo":"bar"}');
    });

    it('should handle nested objects', () => {
      const obj = { a: { b: { c: 1 } } };
      expect(defaultSerializer(obj)).toBe('{"a":{"b":{"c":1}}}');
    });

    it('should handle arrays', () => {
      expect(defaultSerializer([1, 2, 3])).toBe('[1,2,3]');
    });

    it('should handle primitives', () => {
      expect(defaultSerializer('hello')).toBe('"hello"');
      expect(defaultSerializer(42)).toBe('42');
      expect(defaultSerializer(true)).toBe('true');
      expect(defaultSerializer(null)).toBe('null');
    });
  });

  describe('defaultDeserializer', () => {
    it('should deserialize JSON string to object', () => {
      expect(defaultDeserializer('{"foo":"bar"}')).toEqual({ foo: 'bar' });
    });

    it('should handle arrays', () => {
      expect(defaultDeserializer('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should handle primitives', () => {
      expect(defaultDeserializer('"hello"')).toBe('hello');
      expect(defaultDeserializer('42')).toBe(42);
      expect(defaultDeserializer('true')).toBe(true);
      expect(defaultDeserializer('null')).toBe(null);
    });

    it('should throw on invalid JSON', () => {
      expect(() => defaultDeserializer('invalid')).toThrow();
    });
  });

  describe('retry', () => {
    it('should return value on successful action', async () => {
      const action = vi.fn().mockReturnValue('success');

      const result = await retry(action, 3, 10);

      expect(result).toBe('success');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const action = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const result = await retry(action, 3, 10);

      expect(result).toBe('success');
      expect(action).toHaveBeenCalledTimes(3);
    });

    it('should throw after exceeding retry limit', async () => {
      const action = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(action, 2, 10)).rejects.toThrow('always fails');
      expect(action).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should wait between retries', async () => {
      const action = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

      const start = Date.now();
      await retry(action, 1, 50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
    });

    it('should work with async actions', async () => {
      const action = vi.fn().mockResolvedValue('async success');

      const result = await retry(action, 3, 10);

      expect(result).toBe('async success');
    });
  });
});
