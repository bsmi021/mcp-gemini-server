// Using vitest globals - see vitest.config.ts globals: true
import { SQLiteSessionStore } from "../../../../src/services/session/SQLiteSessionStore.js";
import { SessionState } from "../../../../src/services/SessionService.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("SQLiteSessionStore", () => {
  let store: SQLiteSessionStore;
  let testDbPath: string;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test database
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "sqlite-session-test-"));
    testDbPath = path.join(testDir, "test-sessions.db");
    store = new SQLiteSessionStore(testDbPath);
    await store.initialize();
  });

  afterEach(async () => {
    // Clean up
    await store.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("initialize", () => {
    it("should create database file and tables", async () => {
      // Check that database file exists
      const stats = await fs.stat(testDbPath);
      expect(stats.isFile()).toBe(true);
    });

    it("should clean up expired sessions on startup", async () => {
      // Create a new store instance to test initialization cleanup
      const store2 = new SQLiteSessionStore(testDbPath);

      // Add an expired session directly to the database before initialization
      const expiredSession: SessionState = {
        id: "expired-session",
        createdAt: Date.now() - 7200000, // 2 hours ago
        lastActivity: Date.now() - 3600000, // 1 hour ago
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        data: { test: "data" },
      };

      await store.set("expired-session", expiredSession);
      await store.close();

      // Initialize new store - should clean up expired session
      await store2.initialize();
      const retrieved = await store2.get("expired-session");
      expect(retrieved).toBeNull();

      await store2.close();
    });
  });

  describe("set and get", () => {
    it("should store and retrieve a session", async () => {
      const session: SessionState = {
        id: "test-session-1",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour from now
        data: { userId: "user123", preferences: { theme: "dark" } },
      };

      await store.set(session.id, session);
      const retrieved = await store.get(session.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.createdAt).toBe(session.createdAt);
      expect(retrieved?.data).toEqual(session.data);
    });

    it("should return null for non-existent session", async () => {
      const retrieved = await store.get("non-existent");
      expect(retrieved).toBeNull();
    });

    it("should overwrite existing session", async () => {
      const session1: SessionState = {
        id: "test-session",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000,
        data: { version: 1 },
      };

      const session2: SessionState = {
        ...session1,
        data: { version: 2 },
      };

      await store.set(session1.id, session1);
      await store.set(session2.id, session2);

      const retrieved = await store.get(session1.id);
      expect(retrieved?.data).toEqual({ version: 2 });
    });
  });

  describe("delete", () => {
    it("should delete an existing session", async () => {
      const session: SessionState = {
        id: "test-session",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000,
        data: {},
      };

      await store.set(session.id, session);
      const deleted = await store.delete(session.id);
      expect(deleted).toBe(true);

      const retrieved = await store.get(session.id);
      expect(retrieved).toBeNull();
    });

    it("should return false when deleting non-existent session", async () => {
      const deleted = await store.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("deleteExpired", () => {
    it("should delete only expired sessions", async () => {
      const now = Date.now();

      const activeSession: SessionState = {
        id: "active",
        createdAt: now,
        lastActivity: now,
        expiresAt: now + 3600000, // 1 hour from now
        data: {},
      };

      const expiredSession1: SessionState = {
        id: "expired1",
        createdAt: now - 7200000,
        lastActivity: now - 3600000,
        expiresAt: now - 1000, // Expired
        data: {},
      };

      const expiredSession2: SessionState = {
        id: "expired2",
        createdAt: now - 7200000,
        lastActivity: now - 3600000,
        expiresAt: now - 2000, // Expired
        data: {},
      };

      await store.set(activeSession.id, activeSession);
      await store.set(expiredSession1.id, expiredSession1);
      await store.set(expiredSession2.id, expiredSession2);

      const deletedCount = await store.deleteExpired(now);
      expect(deletedCount).toBe(2);

      // Active session should still exist
      expect(await store.get(activeSession.id)).not.toBeNull();

      // Expired sessions should be gone
      expect(await store.get(expiredSession1.id)).toBeNull();
      expect(await store.get(expiredSession2.id)).toBeNull();
    });
  });

  describe("count", () => {
    it("should return correct session count", async () => {
      expect(await store.count()).toBe(0);

      const session1: SessionState = {
        id: "session1",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000,
        data: {},
      };

      const session2: SessionState = {
        id: "session2",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000,
        data: {},
      };

      await store.set(session1.id, session1);
      expect(await store.count()).toBe(1);

      await store.set(session2.id, session2);
      expect(await store.count()).toBe(2);

      await store.delete(session1.id);
      expect(await store.count()).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should throw error when store not initialized", async () => {
      const uninitializedStore = new SQLiteSessionStore(
        path.join(testDir, "uninitialized.db")
      );

      await expect(uninitializedStore.get("test")).rejects.toThrow(
        "SQLite session store not initialized"
      );
    });

    it("should handle JSON parsing errors gracefully", async () => {
      const session: SessionState = {
        id: "test-session",
        createdAt: Date.now(),
        lastActivity: Date.now(),
        expiresAt: Date.now() + 3600000,
        data: { test: "data" },
      };

      await store.set(session.id, session);

      // Manually corrupt the data in the database
      // This is a bit hacky but tests error handling
      const db = (
        store as unknown as {
          db: {
            prepare: (sql: string) => {
              run: (param1: string, param2: string) => void;
            };
          };
        }
      ).db;
      db.prepare("UPDATE sessions SET data = ? WHERE id = ?").run(
        "invalid json",
        session.id
      );

      await expect(store.get(session.id)).rejects.toThrow();
    });
  });
});
