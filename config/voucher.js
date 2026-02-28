/**
 * Shared voucher configuration
 * Use this in both generation and validation to ensure they match
 */

const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Strict pattern (with required dashes): XXXX-XXXX-XXXX-XXXX
const VOUCHER_PATTERN_STRICT = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;

/**
 * Normalize voucher code to standard format with dashes
 * Accepts both: "TEFD8MN5D99Q48MW" (16 chars, no dashes) or "TEFD-8MN5-D99Q-48MW"
 * Returns: "TEFD-8MN5-D99Q-48MW" (standard format with dashes)
 * Returns empty string if invalid
 */
function normalizeVoucherCode(code) {
  if (!code || typeof code !== 'string') return '';
  
  // Keep only valid characters (trim, uppercase, remove dashes temporarily)
  const cleaned = code.trim().toUpperCase().replace(/-/g, '');
  
  // Must be exactly 16 characters
  if (cleaned.length !== 16) return '';
  
  // Check each character is in allowed alphabet
  const validChars = /^[A-HJ-NP-Z2-9]{16}$/;
  if (!validChars.test(cleaned)) return '';
  
  // Reformat with dashes
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`;
}

/**
 * Validate normalized voucher code (already formatted with dashes)
 */
function validateNormalizedCode(code) {
  return VOUCHER_PATTERN_STRICT.test(code);
}

module.exports = {
  VOUCHER_ALPHABET,
  VOUCHER_PATTERN_STRICT,
  normalizeVoucherCode,
  validateNormalizedCode,
};
