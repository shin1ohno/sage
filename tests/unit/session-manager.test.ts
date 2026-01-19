/**
 * Session Manager Unit Tests
 * Requirements: FR-3, FR-5
 *
 * Tests for session lifecycle management and event buffering for resumability.
 */

import {
  SessionManagerImpl,
  createSessionManager,
} from '../../src/cli/session-manager.js';
import type { BufferedEvent } from '../../src/types/streamable-http.js';

describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create session with unique ID', () => {
      const manager = createSessionManager();

      const session1 = manager.createSession();
      const session2 = manager.createSession();

      expect(session1.id).toBeDefined();
      expect(session2.id).toBeDefined();
      expect(session1.id).not.toBe(session2.id);
      // UUID v4 format check
      expect(session1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should associate userId if provided', () => {
      const manager = createSessionManager();

      const sessionWithUser = manager.createSession('user_123');
      const sessionWithoutUser = manager.createSession();

      expect(sessionWithUser.userId).toBe('user_123');
      expect(sessionWithoutUser.userId).toBeUndefined();
    });

    it('should initialize session with correct default values', () => {
      const manager = createSessionManager();
      const now = Date.now();

      const session = manager.createSession();

      expect(session.createdAt).toBeGreaterThanOrEqual(now);
      expect(session.lastActivityAt).toBeGreaterThanOrEqual(now);
      expect(session.activeStreams).toBeInstanceOf(Set);
      expect(session.activeStreams.size).toBe(0);
      expect(session.eventBuffer).toBeInstanceOf(Map);
      expect(session.eventBuffer.size).toBe(0);
      expect(session.initialized).toBe(false);
    });

    it('should enforce max session limit', () => {
      const manager = createSessionManager({ maxSessions: 2 });

      manager.createSession();
      manager.createSession();

      expect(() => manager.createSession()).toThrow('Maximum session limit reached');
    });

    it('should cleanup expired sessions when at limit before rejecting', async () => {
      const manager = createSessionManager({
        maxSessions: 2,
        sessionTimeout: 50, // 50ms timeout for quick expiry
      });

      // Create 2 sessions
      manager.createSession();
      manager.createSession();

      // Wait for sessions to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be able to create new session after cleanup
      const newSession = manager.createSession();
      expect(newSession.id).toBeDefined();
    });
  });

  describe('getSession', () => {
    it('should return session if exists and not expired', () => {
      const manager = createSessionManager();

      const created = manager.createSession('user_abc');
      const retrieved = manager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.userId).toBe('user_abc');
    });

    it('should return undefined if session not found', () => {
      const manager = createSessionManager();

      const result = manager.getSession('non-existent-id');

      expect(result).toBeUndefined();
    });

    it('should return undefined if session is expired', async () => {
      const manager = createSessionManager({
        sessionTimeout: 50, // 50ms timeout
      });

      const session = manager.createSession();
      const sessionId = session.id;

      // Wait for session to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = manager.getSession(sessionId);

      expect(result).toBeUndefined();
    });

    it('should delete expired session when accessed', async () => {
      const manager = createSessionManager({
        sessionTimeout: 50,
      });

      const session = manager.createSession();
      const sessionId = session.id;

      await new Promise((resolve) => setTimeout(resolve, 100));

      // First access should return undefined and delete session
      manager.getSession(sessionId);

      // Session count should be 0
      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session and return true', () => {
      const manager = createSessionManager();

      const session = manager.createSession();
      const sessionId = session.id;

      const result = manager.deleteSession(sessionId);

      expect(result).toBe(true);
      expect(manager.getSession(sessionId)).toBeUndefined();
      expect(manager.getSessionCount()).toBe(0);
    });

    it('should return false for non-existent session', () => {
      const manager = createSessionManager();

      const result = manager.deleteSession('non-existent-id');

      expect(result).toBe(false);
    });

    it('should clear event buffer and active streams on deletion', () => {
      const manager = createSessionManager();

      const session = manager.createSession();
      session.activeStreams.add('stream-1');
      session.activeStreams.add('stream-2');

      const event: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-1',
        data: { test: 'data' },
        timestamp: Date.now(),
      };
      manager.bufferEvent(session.id, event);

      const deleted = manager.deleteSession(session.id);

      expect(deleted).toBe(true);
      // Verify session is fully cleaned up by checking count
      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('bufferEvent', () => {
    it('should buffer events correctly', () => {
      const manager = createSessionManager();
      const session = manager.createSession();

      const event: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-1',
        data: { message: 'test' },
        timestamp: Date.now(),
      };

      manager.bufferEvent(session.id, event);

      const retrievedSession = manager.getSession(session.id);
      expect(retrievedSession?.eventBuffer.get('event-1')).toEqual(event);
    });

    it('should not throw when buffering event for non-existent session', () => {
      const manager = createSessionManager();

      const event: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-1',
        data: { message: 'test' },
        timestamp: Date.now(),
      };

      // Should not throw
      expect(() => manager.bufferEvent('non-existent', event)).not.toThrow();
    });

    it('should respect buffer limit and remove oldest events', () => {
      const manager = createSessionManager({
        maxBufferEventsPerSession: 10,
      });
      const session = manager.createSession();

      // Add 10 events (at limit)
      for (let i = 0; i < 10; i++) {
        const event: BufferedEvent = {
          id: `event-${i}`,
          streamId: 'stream-1',
          data: { index: i },
          timestamp: Date.now() + i, // Ensure ordering
        };
        manager.bufferEvent(session.id, event);
      }

      expect(session.eventBuffer.size).toBe(10);

      // Add one more event (exceeds limit)
      const newEvent: BufferedEvent = {
        id: 'event-new',
        streamId: 'stream-1',
        data: { index: 'new' },
        timestamp: Date.now() + 100,
      };
      manager.bufferEvent(session.id, newEvent);

      // Should have removed oldest 10% (1 event) and added new one
      const retrievedSession = manager.getSession(session.id);
      expect(retrievedSession?.eventBuffer.size).toBe(10);
      expect(retrievedSession?.eventBuffer.has('event-new')).toBe(true);
      // Oldest event should be removed
      expect(retrievedSession?.eventBuffer.has('event-0')).toBe(false);
    });

    it('should cleanup expired events when buffering', async () => {
      const manager = createSessionManager({
        eventBufferRetention: 50, // 50ms retention
      });
      const session = manager.createSession();

      // Add an event
      const oldEvent: BufferedEvent = {
        id: 'old-event',
        streamId: 'stream-1',
        data: { type: 'old' },
        timestamp: Date.now(),
      };
      manager.bufferEvent(session.id, oldEvent);

      // Wait for event to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add a new event (should trigger cleanup of expired events)
      const newEvent: BufferedEvent = {
        id: 'new-event',
        streamId: 'stream-1',
        data: { type: 'new' },
        timestamp: Date.now(),
      };
      manager.bufferEvent(session.id, newEvent);

      const retrievedSession = manager.getSession(session.id);
      expect(retrievedSession?.eventBuffer.has('old-event')).toBe(false);
      expect(retrievedSession?.eventBuffer.has('new-event')).toBe(true);
    });
  });

  describe('getEventsAfter', () => {
    it('should return only events after specified ID from same stream', () => {
      const manager = createSessionManager();
      const session = manager.createSession();

      const baseTime = Date.now();

      // Add events to different streams
      const event1: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-A',
        data: { seq: 1 },
        timestamp: baseTime,
      };
      const event2: BufferedEvent = {
        id: 'event-2',
        streamId: 'stream-A',
        data: { seq: 2 },
        timestamp: baseTime + 10,
      };
      const event3: BufferedEvent = {
        id: 'event-3',
        streamId: 'stream-B', // Different stream
        data: { seq: 3 },
        timestamp: baseTime + 20,
      };
      const event4: BufferedEvent = {
        id: 'event-4',
        streamId: 'stream-A',
        data: { seq: 4 },
        timestamp: baseTime + 30,
      };

      manager.bufferEvent(session.id, event1);
      manager.bufferEvent(session.id, event2);
      manager.bufferEvent(session.id, event3);
      manager.bufferEvent(session.id, event4);

      // Get events after event-1 (should only return stream-A events)
      const eventsAfter = manager.getEventsAfter(session.id, 'event-1');

      expect(eventsAfter).toHaveLength(2);
      expect(eventsAfter[0].id).toBe('event-2');
      expect(eventsAfter[1].id).toBe('event-4');
      // Should not include event-3 from different stream
      expect(eventsAfter.find((e) => e.id === 'event-3')).toBeUndefined();
    });

    it('should return empty array if session not found', () => {
      const manager = createSessionManager();

      const events = manager.getEventsAfter('non-existent', 'event-1');

      expect(events).toEqual([]);
    });

    it('should return empty array if lastEventId not found in buffer', () => {
      const manager = createSessionManager();
      const session = manager.createSession();

      const event: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-1',
        data: { test: true },
        timestamp: Date.now(),
      };
      manager.bufferEvent(session.id, event);

      const events = manager.getEventsAfter(session.id, 'non-existent-event');

      expect(events).toEqual([]);
    });

    it('should return events sorted by timestamp', () => {
      const manager = createSessionManager();
      const session = manager.createSession();

      const baseTime = Date.now();

      // Add events out of order
      const event3: BufferedEvent = {
        id: 'event-3',
        streamId: 'stream-1',
        data: { seq: 3 },
        timestamp: baseTime + 30,
      };
      const event1: BufferedEvent = {
        id: 'event-1',
        streamId: 'stream-1',
        data: { seq: 1 },
        timestamp: baseTime,
      };
      const event2: BufferedEvent = {
        id: 'event-2',
        streamId: 'stream-1',
        data: { seq: 2 },
        timestamp: baseTime + 10,
      };

      manager.bufferEvent(session.id, event3);
      manager.bufferEvent(session.id, event1);
      manager.bufferEvent(session.id, event2);

      const eventsAfter = manager.getEventsAfter(session.id, 'event-1');

      expect(eventsAfter).toHaveLength(2);
      expect(eventsAfter[0].id).toBe('event-2');
      expect(eventsAfter[1].id).toBe('event-3');
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      const manager = createSessionManager({
        sessionTimeout: 50, // 50ms timeout
      });

      manager.createSession('user-1');
      manager.createSession('user-2');

      expect(manager.getSessionCount()).toBe(2);

      // Wait for sessions to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleanedCount = manager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(2);
      expect(manager.getSessionCount()).toBe(0);
    });

    it('should keep valid sessions', async () => {
      const manager = createSessionManager({
        sessionTimeout: 200, // 200ms timeout
      });

      const session1 = manager.createSession('user-1');

      // Wait a bit but not enough to expire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create another session (this one is newer)
      manager.createSession('user-2');

      // Touch session1 to keep it active
      (manager as SessionManagerImpl).touchSession(session1.id);

      // Wait more (but session1 should still be valid due to touch)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const cleanedCount = manager.cleanupExpiredSessions();

      // Both sessions should still be valid
      expect(cleanedCount).toBe(0);
      expect(manager.getSessionCount()).toBe(2);
    });

    it('should return 0 when no sessions are expired', () => {
      const manager = createSessionManager();

      manager.createSession();
      manager.createSession();

      const cleanedCount = manager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(0);
      expect(manager.getSessionCount()).toBe(2);
    });
  });

  describe('touchSession', () => {
    it('should update lastActivityAt timestamp', async () => {
      const manager = createSessionManager() as SessionManagerImpl;
      const session = manager.createSession();
      const originalActivity = session.lastActivityAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 20));

      manager.touchSession(session.id);

      const updatedSession = manager.getSession(session.id);
      expect(updatedSession?.lastActivityAt).toBeGreaterThan(originalActivity);
    });

    it('should not throw for non-existent session', () => {
      const manager = createSessionManager() as SessionManagerImpl;

      expect(() => manager.touchSession('non-existent')).not.toThrow();
    });
  });

  describe('getSessionCount', () => {
    it('should return correct session count', () => {
      const manager = createSessionManager();

      expect(manager.getSessionCount()).toBe(0);

      manager.createSession();
      expect(manager.getSessionCount()).toBe(1);

      manager.createSession();
      expect(manager.getSessionCount()).toBe(2);
    });
  });

  describe('cleanup timer', () => {
    it('should start and stop cleanup timer', () => {
      const manager = createSessionManager() as SessionManagerImpl;

      // Start timer
      manager.startCleanupTimer(100);

      // Should not throw when stopping
      expect(() => manager.stopCleanupTimer()).not.toThrow();
    });

    it('should stop existing timer when starting new one', () => {
      const manager = createSessionManager() as SessionManagerImpl;

      manager.startCleanupTimer(100);
      // Starting again should replace the timer
      manager.startCleanupTimer(200);

      manager.stopCleanupTimer();
    });

    it('should periodically clean up expired sessions', async () => {
      const manager = createSessionManager({
        sessionTimeout: 30, // Very short timeout
      }) as SessionManagerImpl;

      manager.createSession();
      expect(manager.getSessionCount()).toBe(1);

      // Start cleanup timer with short interval
      manager.startCleanupTimer(50);

      // Wait for session to expire and cleanup to run
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(manager.getSessionCount()).toBe(0);

      manager.stopCleanupTimer();
    });
  });

  describe('createSessionManager factory', () => {
    it('should create manager with default options', () => {
      const manager = createSessionManager();

      expect(manager).toBeDefined();
      expect(manager.getSessionCount()).toBe(0);
    });

    it('should create manager with custom options', () => {
      const manager = createSessionManager({
        sessionTimeout: 5000,
        maxSessions: 50,
      });

      // Create sessions up to limit
      for (let i = 0; i < 50; i++) {
        manager.createSession();
      }

      expect(manager.getSessionCount()).toBe(50);
      expect(() => manager.createSession()).toThrow('Maximum session limit reached');
    });
  });
});
