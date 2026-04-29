'use strict';

const crypto = require('crypto');
const logger = require('../config/logger');

// ─── Constants ───────────────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const PREFIX = 'enc:v1:';

/**
 * Derive a unique encryption key for each user from master key + user salt.
 * Uses PBKDF2 with 100,000 iterations.
 */
function deriveKey(userSalt) {
  const masterKey = process.env.ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('ENCRYPTION_KEY is not set in environment variables.');
  }
  return crypto.pbkdf2Sync(masterKey, userSalt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt a plaintext string.
 * @param {string} text - The plaintext to encrypt
 * @param {string} userSalt - User-specific salt for key derivation
 * @returns {string} Encrypted string in format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encrypt(text, userSalt) {
  if (!text && text !== 0) return text;
  const strText = String(text);

  // Don't double-encrypt
  if (isEncrypted(strText)) return strText;

  try {
    const key = deriveKey(userSalt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(strText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    logger.error('Encryption error:', err.message);
    return text; // Return original on error
  }
}

/**
 * Decrypt an encrypted string.
 * @param {string} encryptedText - The encrypted string
 * @param {string} userSalt - User-specific salt for key derivation
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedText, userSalt) {
  if (!encryptedText) return encryptedText;
  const strText = String(encryptedText);

  // Not encrypted, return as-is
  if (!isEncrypted(strText)) return encryptedText;

  try {
    const withoutPrefix = strText.slice(PREFIX.length);
    const [ivHex, authTagHex, ciphertext] = withoutPrefix.split(':');

    if (!ivHex || !authTagHex || !ciphertext) {
      logger.warn('Malformed encrypted data');
      return encryptedText;
    }

    const key = deriveKey(userSalt);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error('Decryption error:', err.message);
    return encryptedText; // Return encrypted text on error
  }
}

/**
 * Check if a string is encrypted (has the enc:v1: prefix).
 */
function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(PREFIX);
}

/**
 * Generate a random salt for a user.
 * @returns {string} 32-byte hex string
 */
function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt specified fields of an expense document.
 * @param {Object} data - The expense data (plain object or mongoose doc)
 * @param {Object} user - User document with encryption settings
 * @returns {Object} Data with encrypted fields
 */
function encryptExpenseFields(data, user) {
  if (!user?.encryption?.enabled || !user?.encryption?.salt) return data;

  const fields = user.encryption.fields || {};
  const salt = user.encryption.salt;

  if (fields.title && data.title) {
    data.title = encrypt(String(data.title), salt);
  }
  if (fields.note && data.note) {
    data.note = encrypt(String(data.note), salt);
  }
  if (fields.amount && data.amount != null) {
    data.amount = encrypt(String(data.amount), salt);
  }

  return data;
}

/**
 * Decrypt specified fields of an expense document.
 * @param {Object} doc - The expense document (plain object)
 * @param {Object} user - User document with encryption settings
 * @returns {Object} Document with decrypted fields
 */
function decryptExpenseFields(doc, user) {
  if (!doc || !user?.encryption?.enabled || !user?.encryption?.salt) return doc;

  const salt = user.encryption.salt;

  if (doc.title && isEncrypted(String(doc.title))) {
    doc.title = decrypt(String(doc.title), salt);
  }
  if (doc.note && isEncrypted(String(doc.note))) {
    doc.note = decrypt(String(doc.note), salt);
  }
  if (doc.amount != null && isEncrypted(String(doc.amount))) {
    const decrypted = decrypt(String(doc.amount), salt);
    doc.amount = parseFloat(decrypted) || 0;
  }

  return doc;
}

/**
 * Decrypt an array of expense documents.
 * @param {Array} docs - Array of expense documents
 * @param {Object} user - User document with encryption settings
 * @returns {Array} Array with decrypted documents
 */
function decryptExpenseArray(docs, user) {
  if (!docs || !Array.isArray(docs)) return docs;
  if (!user?.encryption?.enabled || !user?.encryption?.salt) return docs;
  return docs.map(doc => decryptExpenseFields(doc, user));
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  generateSalt,
  deriveKey,
  encryptExpenseFields,
  decryptExpenseFields,
  decryptExpenseArray,
};
