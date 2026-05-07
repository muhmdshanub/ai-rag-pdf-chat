/**
 * Standard API Response Formatter
 * 
 * Enforces a consistent JSON structure across all endpoints.
 * All successful responses will have the shape:
 * {
 *   "success": true,
 *   "message": "Optional message",
 *   "data": { ...payload }
 * }
 */
class ApiResponse {
  /**
   * Send a successful API response
   * 
   * @param {Object} res - Express response object
   * @param {any} data - The payload to send
   * @param {string} [message] - Optional success message
   * @param {number} [statusCode=200] - HTTP status code
   * @param {Object} [meta] - Optional metadata (like pagination, duration, etc.)
   */
  static success(res, data = null, message = null, statusCode = 200, meta = null) {
    const response = {
      success: true,
    };

    if (message) {
      response.message = message;
    }

    if (data !== null) {
      response.data = data;
    }

    if (meta) {
      response.meta = meta;
    }

    return res.status(statusCode).json(response);
  }
}

module.exports = ApiResponse;
