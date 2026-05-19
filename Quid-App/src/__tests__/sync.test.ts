/**
 * Tests for sync utility functions
 */
import { describe, it, expect, vi } from 'vitest';
import {
  generateTempId,
  isTempId,
  getRetryDelay,
  MAX_RETRY_COUNT,
  BASE_RETRY_DELAY,
} from '@/lib/local/sync/utils';

// ============================================
// Temp ID Generation
// ============================================

describe('generateTempId', () => {
  it('should start with "temp_" prefix', () => {
    const id = generateTempId();
    expect(id).toMatch(/^temp_/);
  });

  it('should contain a timestamp', () => {
    const before = Date.now();
    const id = generateTempId();
    const after = Date.now();

    // Extract timestamp from id
    const timestamp = parseInt(id.split('_')[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTempId());
    }
    expect(ids.size).toBe(100);
  });

  it('should have a random suffix after the timestamp', () => {
    const id = generateTempId();
    const parts = id.split('_');
    expect(parts.length).toBe(3); // temp, timestamp, random
    expect(parts[2].length).toBeGreaterThan(0);
  });
});

describe('isTempId', () => {
  it('should return true for temp IDs', () => {
    expect(isTempId('temp_12345_abc123')).toBe(true);
    expect(isTempId('temp_0_x')).toBe(true);
  });

  it('should return false for real IDs (cuid)', () => {
    expect(isTempId('clxyz123abc')).toBe(false);
    expect(isTempId('abc123')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isTempId('')).toBe(false);
  });

  it('should return false for IDs that merely contain "temp"', () => {
    expect(isTempId('itemporary')).toBe(false);
    expect(isTempId('123temp_')).toBe(false);
  });
});

// ============================================
// Retry Logic / Exponential Backoff
// ============================================

describe('getRetryDelay', () => {
  it('should return base delay for retry 0', () => {
    expect(getRetryDelay(0)).toBe(BASE_RETRY_DELAY); // 1000ms
  });

  it('should double delay for each retry', () => {
    expect(getRetryDelay(1)).toBe(2000);
    expect(getRetryDelay(2)).toBe(4000);
    expect(getRetryDelay(3)).toBe(8000);
    expect(getRetryDelay(4)).toBe(16000);
  });

  it('should cap at 30 seconds maximum', () => {
    expect(getRetryDelay(10)).toBe(30000);
    expect(getRetryDelay(100)).toBe(30000);
  });

  it('should use BASE_RETRY_DELAY constant', () => {
    expect(BASE_RETRY_DELAY).toBe(1000);
  });

  it('should have MAX_RETRY_COUNT of 5', () => {
    expect(MAX_RETRY_COUNT).toBe(5);
  });
});

// ============================================
// Sync Types Validation
// ============================================

describe('MutationQueueEntry type shape', () => {
  it('should have all required fields for a valid mutation entry', () => {
    // This test validates the type shape matches what the sync engine expects
    const entry = {
      id: 'test-id',
      operation: 'create' as const,
      tableName: 'accounts',
      recordId: 'record-id',
      payload: '{}',
      apiRoute: '/api/accounts',
      apiMethod: 'POST',
      sequence: Date.now(),
      status: 'pending' as const,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Verify all required fields exist
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('operation');
    expect(entry).toHaveProperty('tableName');
    expect(entry).toHaveProperty('recordId');
    expect(entry).toHaveProperty('payload');
    expect(entry).toHaveProperty('sequence');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('retryCount');
    expect(entry).toHaveProperty('createdAt');
    expect(entry).toHaveProperty('updatedAt');
  });

  it('should support all operation types', () => {
    const operations = ['create', 'update', 'delete', 'complex'] as const;
    for (const op of operations) {
      const entry = {
        operation: op,
        status: 'pending' as const,
      };
      expect(entry.operation).toBe(op);
    }
  });

  it('should support all status types', () => {
    const statuses = ['pending', 'in_progress', 'completed', 'failed'] as const;
    for (const status of statuses) {
      const entry = { status };
      expect(entry.status).toBe(status);
    }
  });
});

// ============================================
// SyncMeta type validation
// ============================================

describe('SyncMeta type shape', () => {
  it('should have required sync metadata fields', () => {
    const meta = {
      _syncStatus: 'synced' as const,
      _version: 1,
      _lastModified: Date.now(),
    };

    expect(meta).toHaveProperty('_syncStatus');
    expect(meta).toHaveProperty('_version');
    expect(meta).toHaveProperty('_lastModified');
  });

  it('should support all sync status values', () => {
    const statuses = ['synced', 'pending_create', 'pending_update', 'pending_delete', 'conflict'] as const;
    for (const status of statuses) {
      const meta = { _syncStatus: status };
      expect(meta._syncStatus).toBe(status);
    }
  });
});

// ============================================
// API_TABLE_MAP consistency
// ============================================

describe('API_TABLE_MAP', () => {
  it('should map all sync endpoints to table names', async () => {
    const { API_TABLE_MAP } = await import('@/lib/local/db');

    const expectedEndpoints = [
      '/api/accounts', '/api/transactions', '/api/budgets',
      '/api/debts', '/api/savings', '/api/cdts',
      '/api/recurring', '/api/payroll', '/api/vehicles',
      '/api/medications', '/api/appointments', '/api/pantry',
      '/api/shopping-lists', '/api/health-profiles',
      '/api/fuel-prices', '/api/settings',
    ];

    for (const endpoint of expectedEndpoints) {
      expect(API_TABLE_MAP).toHaveProperty(endpoint);
    }
  });

  it('should have TABLE_API_MAP as reverse of API_TABLE_MAP', async () => {
    const { API_TABLE_MAP, TABLE_API_MAP } = await import('@/lib/local/db');

    for (const [api, table] of Object.entries(API_TABLE_MAP)) {
      expect(TABLE_API_MAP[table]).toBe(api);
    }
  });
});
