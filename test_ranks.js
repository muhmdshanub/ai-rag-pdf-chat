const { pool } = require('./backend/src/config/database');

async function debug() {
  const q1 = "how many companies he worked";
  const q2 = "What are the main features of the Vergno platform?";
  const q3 = "Where did he complete his B.Tech degree and what was his CGPA?";

  for (const q of [q1, q2, q3]) {
    const query = `
      SELECT chunk_index, 
             ts_rank(fts_vector, replace(plainto_tsquery('english', $1)::text, '&', '|')::tsquery) as rank
      FROM chunks 
      WHERE document_id=(SELECT id FROM documents ORDER BY created_at DESC LIMIT 1)
        AND fts_vector @@ replace(plainto_tsquery('english', $1)::text, '&', '|')::tsquery
      ORDER BY rank DESC;
    `;
    const res = await pool.query(query, [q]);
    console.log(`\nQuery: "${q}"`);
    res.rows.forEach(r => console.log(`[Chunk ${r.chunk_index}] ts_rank: ${r.rank}`));
  }
  process.exit(0);
}
debug().catch(console.error);
