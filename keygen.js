const crypto = require('crypto');

// Uppercase alphanumeric, ambiguous characters removed: 0/O and 1/I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSegment(length) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Generates a key like FOCUSS-XXXX-XXXX-XXXX
 */
function generateKey() {
  return `FOCUSS-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

/**
 * Parses a duration string like "7d", "30d", or "lifetime".
 * Returns { durationDays: number|null } where null means lifetime.
 * Throws on invalid input.
 */
function parseDuration(input) {
  const normalized = String(input).trim().toLowerCase();
  if (normalized === 'lifetime' || normalized === 'life' || normalized === 'permanent') {
    return { durationDays: null };
  }
  const match = normalized.match(/^(\d+)\s*d(ays?)?$/);
  if (!match) {
    throw new Error(`Invalid duration "${input}". Use formats like "7d", "30d", or "lifetime".`);
  }
  const days = parseInt(match[1], 10);
  if (days <= 0 || days > 3650) {
    throw new Error(`Duration must be between 1 and 3650 days.`);
  }
  return { durationDays: days };
}

module.exports = { generateKey, parseDuration };
