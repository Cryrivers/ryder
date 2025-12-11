import type { MessageSource, RyderMessageEvent } from '../src/typings';

/**
 * Mock MessageSource for testing Ryder client and server communication.
 * Implements the MessageSource interface and provides utilities for testing.
 */
export class MockMessageSource implements MessageSource {
  private listeners: ((ev: RyderMessageEvent) => void)[] = [];
  public postedMessages: string[] = [];
  public linkedSource: MockMessageSource | null = null;

  addEventListener(_type: 'message', listener: (ev: RyderMessageEvent) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: 'message', listener: (ev: RyderMessageEvent) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  postMessage(message: string): void {
    this.postedMessages.push(message);
    // If linked to another source, simulate message delivery
    if (this.linkedSource) {
      this.linkedSource.simulateMessage(message, this);
    }
  }

  /**
   * Simulate receiving a message from a source
   */
  simulateMessage(data: string, source: MockMessageSource | null = null): void {
    const event = { data, source } as RyderMessageEvent;
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Create a RyderMessageEvent object for test purposes
   */
  createEvent(data: string): RyderMessageEvent {
    return { data, source: this } as RyderMessageEvent;
  }

  /**
   * Get the last posted message
   */
  getLastMessage(): string | undefined {
    return this.postedMessages[this.postedMessages.length - 1];
  }

  /**
   * Get the last posted message parsed as JSON
   */
  getLastMessageParsed<T = unknown>(): T | undefined {
    const msg = this.getLastMessage();
    return msg ? JSON.parse(msg) : undefined;
  }

  /**
   * Clear all posted messages
   */
  clearMessages(): void {
    this.postedMessages = [];
  }

  /**
   * Link two MockMessageSources together so postMessage on one
   * triggers simulateMessage on the other
   */
  static link(source1: MockMessageSource, source2: MockMessageSource): void {
    source1.linkedSource = source2;
    source2.linkedSource = source1;
  }

  /**
   * Unlink two MockMessageSources
   */
  static unlink(source1: MockMessageSource, source2: MockMessageSource): void {
    source1.linkedSource = null;
    source2.linkedSource = null;
  }
}

/**
 * Helper function to create a RyderMessageEvent for testing
 */
export function createTestEvent(data: string, source: MockMessageSource | null): RyderMessageEvent {
  return { data, source } as RyderMessageEvent;
}
