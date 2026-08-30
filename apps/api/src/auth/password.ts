import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
const KEY_LENGTH = 64;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const LEGACY_N = 16_384;

function derivarChave(
  password: string,
  salt: string,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$feedbot-dummy-salt$${scryptSync(
  "senha-inexistente",
  "feedbot-dummy-salt",
  KEY_LENGTH,
  { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
).toString("hex")}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derivarChave(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts[0] !== "scrypt") return false;
  const moderno = parts.length === 6;
  const N = moderno ? Number(parts[1]) : LEGACY_N;
  const r = moderno ? Number(parts[2]) : SCRYPT_R;
  const p = moderno ? Number(parts[3]) : SCRYPT_P;
  const salt = moderno ? parts[4] : parts[1];
  const keyHex = moderno ? parts[5] : parts[2];
  if (
    !salt ||
    !keyHex ||
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    (N & (N - 1)) !== 0 ||
    N < LEGACY_N ||
    N > 131_072 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 8 ||
    !/^[a-f\d]+$/i.test(keyHex) ||
    keyHex.length % 2 !== 0
  )
    return false;
  const expected = Buffer.from(keyHex, "hex");
  if (!expected.length || expected.length > 128) return false;
  const maxmem = Math.max(SCRYPT_MAXMEM, 128 * N * r + 1024 * 1024);
  const actual = await derivarChave(password, salt, expected.length, { N, r, p, maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function hashToken(token: string): Promise<string> {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
