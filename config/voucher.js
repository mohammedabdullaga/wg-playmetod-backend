/**
 * Shared voucher configuration
 * Use this in both generation and validation to ensure they match
 */

const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOUCHER_PATTERN = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;

module.exports = {
  VOUCHER_ALPHABET,
  VOUCHER_PATTERN,
};
