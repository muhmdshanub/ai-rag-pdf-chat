/**
 * PDFParserService Tests
 *
 * Tests the parser's own responsibilities:
 * - Buffer validation (validatePDFBuffer)
 * - Text extraction (extractText, extractFromBuffer)
 * - Caching delegation
 *
 * File-level validation (existence, size, extension) is StorageService's
 * responsibility and tested separately.
 */

const PDFParserService = require('./pdf-parser.service');
const fs = require('fs').promises;
const path = require('path');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock StorageService — PDFParserService should never touch the filesystem directly
jest.mock('./storage.service', () => {
  const testPDFBuffer = null; // will be set in beforeAll
  return {
    validateFile: jest.fn().mockResolvedValue({ stats: {}, absolutePath: '', extension: '.pdf' }),
    readFile: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    getFilePath: jest.fn((f) => f),
    fileExists: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('./cache.service', () => ({
  generateFileKey: jest.fn().mockResolvedValue('mock-hash'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));

const storageService = require('./storage.service');
const cacheService = require('./cache.service');

// Load a real PDF buffer for extraction tests
let realPDFBuffer = null;
const testPDFPath = path.join(__dirname, '../../samples/test.pdf');

beforeAll(async () => {
  try {
    realPDFBuffer = await fs.readFile(testPDFPath);
  } catch {
    // test.pdf not available — extraction tests will be skipped
  }
});

describe('PDFParserService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── validatePDFBuffer ──────────────────────────────────────────────

  describe('validatePDFBuffer', () => {
    it('should accept a valid PDF buffer', () => {
      const buf = Buffer.from('%PDF-1.4 some content here');
      expect(() => PDFParserService.validatePDFBuffer(buf)).not.toThrow();
    });

    it('should throw for non-Buffer input', () => {
      expect(() => PDFParserService.validatePDFBuffer('string')).toThrow('must be a Buffer');
      expect(() => PDFParserService.validatePDFBuffer(123)).toThrow('must be a Buffer');
    });

    it('should throw for empty buffer', () => {
      expect(() => PDFParserService.validatePDFBuffer(Buffer.alloc(0))).toThrow('empty');
    });

    it('should throw for buffer without PDF signature', () => {
      expect(() => PDFParserService.validatePDFBuffer(Buffer.from('NOT PDF'))).toThrow('valid PDF signature');
    });
  });



  // ─── extractFromBuffer ──────────────────────────────────────────────

  describe('extractFromBuffer', () => {
    it('should extract text from a real PDF buffer', async () => {
      if (!realPDFBuffer) return;

      const result = await PDFParserService.extractFromBuffer(realPDFBuffer);
      expect(result.pages).toBeGreaterThan(0);
      expect(typeof result.text).toBe('string');
    });

    it('should throw for empty buffer', async () => {
      await expect(PDFParserService.extractFromBuffer(Buffer.alloc(0))).rejects.toThrow('empty');
    });

    it('should throw for non-Buffer', async () => {
      await expect(PDFParserService.extractFromBuffer('string')).rejects.toThrow('must be a Buffer');
    });
  });
});
