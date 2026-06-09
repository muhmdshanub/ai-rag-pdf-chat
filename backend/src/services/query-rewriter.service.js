/**
 * Query Rewriter Service
 *
 * Extracts critical keywords from a natural language question before
 * passing it to the Full Text Search (FTS) engine.
 *
 * Without this, generic words like "many", "worked", "what" trigger
 * false FTS boosts for unrelated chunks, degrading retrieval quality.
 *
 * Rules:
 * - NO database queries
 * - MUST fallback gracefully on timeout or API failure
 * - Uses the fast lightweight model to minimise latency
 */

const logger = require('../utils/logger');
const config = require('../config');

class QueryRewriterService {
  constructor() {
    this.enabled = config.rag.queryRewriter.enabled;
    this.model = config.rag.queryRewriter.model;
    this.timeoutMs = config.rag.queryRewriter.timeoutMs;

    this.systemPrompt = [
      'You are a keyword extraction engine for a search system.',
      'Given a natural language question, extract ONLY the critical search terms:',
      '  - Proper nouns (names of people, companies, places, products)',
      '  - Technical terms and acronyms (e.g. CGPA, RabbitMQ, PostgreSQL)',
      '  - Specific domain identifiers (e.g. B.Tech, TechOps, Packapeer)',
      'Rules:',
      '  - Return ONLY the keywords separated by spaces. No explanation.',
      '  - Omit all verbs, articles, prepositions, and common words.',
      '  - If no specific keywords exist, return an empty string.',
      'Examples:',
      '  Q: "Where did he complete his B.Tech degree and what was his CGPA?"',
      '  A: "B.Tech CGPA"',
      '  Q: "What are the main features of the Vergno platform?"',
      '  A: "Vergno"',
      '  Q: "How many companies has he worked at?"',
      '  A: ""',
      '  Q: "What was his role at Packapeer Academy?"',
      '  A: "Packapeer Academy"',
    ].join('\n');
  }

  /**
   * Extract search keywords from a natural language question.
   *
   * On any failure or timeout, returns the original query as fallback
   * so the rest of the pipeline is never blocked.
   *
   * @param {string} question - The user's raw question
   * @returns {Promise<string>} Extracted keywords (may be empty string)
   */
  async extractKeywords(question) {
    if (!this.enabled) {
      logger.debug('QueryRewriter disabled, returning original query');
      return question;
    }

    if (!question || typeof question !== 'string') {
      return question;
    }

    try {
      // Dynamic require to avoid circular dependency at load time
      const groqClient = require('../utils/groq.client');

      const payload = {
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: `Question: "${question}"` }
        ],
        temperature: 0,       // Deterministic — keyword extraction is not creative
        max_tokens: 50,       // Keywords are short — no need for more
      };

      // Race against a timeout so we never block the pipeline
      const result = await Promise.race([
        groqClient.chatCompletion(payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('QueryRewriter timeout')), this.timeoutMs)
        )
      ]);

      const keywords = result?.choices?.[0]?.message?.content?.trim() || '';

      logger.debug('QueryRewriter extracted keywords', {
        original: question.substring(0, 60),
        keywords,
      });

      // If no meaningful keywords were extracted, fall back to original
      // so vector search still works on the full question
      return keywords.length > 0 ? keywords : question;

    } catch (error) {
      // Graceful degradation — never block the chat pipeline
      logger.warn('QueryRewriter failed, falling back to original query', {
        error: error.message,
        question: question.substring(0, 60),
      });
      return question;
    }
  }
}

module.exports = new QueryRewriterService();
