import {
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
const N = 131072,
  r = 8,
  p = 1;
let active = 0;
const waiting: (() => void)[] = [];
async function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  // Bound memory-heavy KDF work per function instance, including a bounded waiting queue.
  if (active >= 2) {
    if (waiting.length >= 16)
      throw Object.assign(new Error('Password service busy'), { code: 'AUTH_BUSY' });
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    return await new Promise((resolve, reject) =>
      rawScrypt(password, salt, 64, { N, r, p, maxmem: 160 * 1024 * 1024 }, (e, key) =>
        e ? reject(e) : resolve(key),
      ),
    );
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${(await scrypt(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [kind, n, rr, pp, salt, expected] = encoded.split('$');
  if (
    kind !== 'scrypt' ||
    Number(n) !== N ||
    Number(rr) !== r ||
    Number(pp) !== p ||
    !/^[0-9a-f]{32}$/.test(salt || '') ||
    !/^[0-9a-f]{128}$/.test(expected || '')
  )
    return false;
  return timingSafeEqual(
    await scrypt(password, Buffer.from(salt, 'hex')),
    Buffer.from(expected, 'hex'),
  );
}
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest();
export const hmac = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest();
export const csrf = (secret: string, value: string) =>
  hmac(secret, 'csrf:' + value).toString('base64url');
export const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
export const dummyHash = `scrypt$${N}$${r}$${p}$${'00'.repeat(16)}$${'00'.repeat(64)}`;
