import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Pool } from 'mysql2/promise';
import { config } from '../src/config.ts';
import { createApp } from '../src/app.ts';

test('readiness rejects a database missing the user administration migration', async () => {
  let released = false;
  const pool = {
    async getConnection() {
      return {
        async query(sql: string) {
          if (sql.includes('row_version FROM users'))
            throw Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
          return [[{ n: sql.includes('information_schema.routines') ? 6 : 1 }]];
        },
        release() { released = true; },
      };
    },
  } as unknown as Pool;
  const response = await request(createApp(pool, config())).get('/api/v1/health/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'NOT_READY');
  assert.equal(response.text.includes('Unknown column'), false);
  assert.equal(released, true);
});
