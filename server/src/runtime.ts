import { config } from './config.ts';
import { createPool } from './db.ts';
import { createApp } from './app.ts';
const settings = config();
const pool = createPool(settings);
export const app = createApp(pool, settings);
export { pool };
