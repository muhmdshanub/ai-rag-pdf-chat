/**
 * Shared Utility Helpers
 *
 * Generic functions reused across services.
 * Keep this file focused on pure, stateless transformations.
 */

const logger = require('./logger');

/**
 * Safely extract a string value, handling Buffers and edge cases
 *
 * @param {*} value - Value to extract
 * @returns {string|null} Cleaned string or null
 */
function safeString(value) {
  if (!value) return null;

  try {
    if (Buffer.isBuffer(value)) {
      return value.toString('utf8').trim() || null;
    }

    const str = String(value).trim();
    return str.length > 0 ? str : null;
  } catch (error) {
    logger.warn('Failed to extract string value', { error: error.message });
    return null;
  }
}

/**
 * Parse PDF date format (D:YYYYMMDDHHmmSSOHH'mm') to ISO string
 *
 * @param {*} dateValue - Date value from PDF metadata
 * @returns {string|null} ISO date string or null
 */
function parsePDFDate(dateValue) {
  if (!dateValue) return null;

  try {
    const dateStr = String(dateValue);

    if (dateStr.startsWith('D:')) {
      const cleaned = dateStr
        .replace('D:', '')
        .replace(/[+-]\d{2}'/, 'T')
        .replace('\'', '');
      const date = new Date(cleaned);

      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // Fallback: standard Date parsing
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }

    return null;
  } catch (error) {
    logger.warn('Failed to parse date', { value: dateValue, error: error.message });
    return null;
  }
}

module.exports = {
  safeString,
  parsePDFDate,
};
