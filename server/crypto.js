/**
 * A.E.G.I.S 4.0 — Cryptographic Utilities for Step-Up Authentication
 * WP-4.2.3 | MFA Authenticated Encryption, TOTP & Action PIN Hashing
 *
 * Security Invariants:
 * 1. TOTP secrets are encrypted using authenticated AES-256-GCM with an externally
 *    managed encryption key (process.env.MFA_ENCRYPTION_KEY or derived fallback for test).
 *    Never stored as plaintext or one-way hashes.
 * 2. 5-digit Action PINs are strictly hashed using scrypt with cryptographically random
 *    salts. Plaintext or reversible PINs are strictly prohibited.
 * 3. Recovery codes are hashed with SHA-256 before persistence.
 * 4. Step-up authorization tokens are 32-byte base64url random tokens hashed with SHA-256.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import { fail } from './policy.js';

// ─── Key Derivation for MFA Authenticated Encryption ──────────────────────────

function getMfaEncryptionKey() {
  const envKey = process.env.MFA_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    return scryptSync(envKey, 'aegis:mfa:salt', 32);
  }
  // Deterministic local development fallback derived safely
  const devSeed = process.env.DATABASE_URL || 'aegis-dev-mfa-default-key-seed';
  return scryptSync(devSeed, 'aegis:mfa:salt', 32);
}

/**
 * Authenticated Encryption (AES-256-GCM) for TOTP secrets
 * Returns string format: iv:authTag:ciphertext (hex-encoded)
 */
export function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    fail(400, 'Invalid plaintext for encryption.');
  }
  const key = getMfaEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Authenticated Decryption (AES-256-GCM) for TOTP secrets
 */
export function decryptSecret(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    fail(400, 'Invalid encrypted payload format.');
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    fail(500, 'Malformed encrypted secret format.');
  }
  const [ivHex, authTagHex, cipherHex] = parts;
  try {
    const key = getMfaEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    fail(500, 'Authenticated decryption of MFA secret failed.');
  }
}

// ─── 5-Digit Action PIN Hashing (scrypt) ───────────────────────────────────────

export function validatePinFormat(pin) {
  if (typeof pin !== 'string' || !/^\d{5}$/.test(pin)) {
    fail(422, 'Action PIN must be exactly five numeric digits.');
  }
}

export function hashActionPin(pin) {
  validatePinFormat(pin);
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(pin, salt, 64, { N: 16384, r: 8, p: 1 });
  return { pinHash: derived.toString('hex'), pinSalt: salt };
}

export function verifyActionPin(pin, storedHash, storedSalt) {
  validatePinFormat(pin);
  if (!storedHash || !storedSalt) return false;
  try {
    const derived = scryptSync(pin, storedSalt, 64, { N: 16384, r: 8, p: 1 });
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

// ─── TOTP (Time-based One-Time Password, RFC 6238) ─────────────────────────────

// Standard Base32 decoding for TOTP RFC 3548 / 6238
const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret() {
  // 20 bytes (160 bits) recommended for SHA-1 TOTP
  const bytes = randomBytes(20);
  let bits = '';
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i].toString(2).padStart(8, '0');
  }
  let secret = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, '0');
    secret += RFC4648_ALPHABET[parseInt(chunk, 2)];
  }
  return secret;
}

export function getTotpUri(secret, accountName = 'A.E.G.I.S Admin', issuer = 'A.E.G.I.S') {
  const encAccount = encodeURIComponent(accountName);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

function base32ToBuffer(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = RFC4648_ALPHABET.indexOf(clean[i]);
    if (val === -1) fail(400, 'Invalid Base32 character in secret.');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function computeTotp(secretBase32, timeStepWindow = 0, stepSeconds = 30) {
  const key = base32ToBuffer(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds) + timeStepWindow;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);

  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (codeInt % 1000000).toString().padStart(6, '0');
}

/**
 * Verifies TOTP code against secret with a drift allowance window of ±1 interval (30 seconds)
 */
export function verifyTotp(code, secretBase32) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  // Check window: -1, 0, +1 (drift tolerance)
  for (const window of [-1, 0, 1]) {
    const expected = computeTotp(secretBase32, window);
    if (expected.length === code.length && timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

// ─── Recovery Codes (SHA-256) ─────────────────────────────────────────────────

export function generateRecoveryCodes(count = 8) {
  const plaintextCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < count; i++) {
    // 8 characters alphanumeric format: e.g., 'A7K9-M4X2'
    const part1 = randomBytes(2).toString('hex').toUpperCase();
    const part2 = randomBytes(2).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    plaintextCodes.push(code);
    hashedCodes.push(createHash('sha256').update(code).digest('hex'));
  }
  return { plaintextCodes, hashedCodes };
}

export function hashRecoveryCode(code) {
  const normalized = code.trim().toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}
