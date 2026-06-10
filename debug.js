const { pool } = require('./backend/src/config/database');

async function debug() {
  const res = await pool.query('SELECT id, embedding FROM chunks ORDER BY id DESC LIMIT 1');
  const dummyEmbedding = res.rows[0].embedding;
  const docId = res.rows[0].id; // Wait, we need document_id
  
  const docRes = await pool.query('SELECT document_id FROM chunks WHERE id = $1', [docId]);
  const documentId = docRes.rows[0].document_id;

  const result = await pool.query(`
    WITH vector_search AS (
      SELECT id, chunk_index, content, 1 - (embedding <=> $2::vector) AS similarity
      FROM chunks WHERE document_id = $3
      ORDER BY embedding <=> $2::vector LIMIT 5
    ),
    keyword_search AS (
      SELECT id, chunk_index, content, ts_rank(fts_vector, replace(plainto_tsquery('english', $1)::text, '&', '|')::tsquery) AS similarity
      FROM chunks 
      WHERE document_id = $3 
        AND plainto_tsquery('english', $1)::text != ''
        AND fts_vector @@ replace(plainto_tsquery('english', $1)::text, '&', '|')::tsquery
      ORDER BY similarity DESC LIMIT 5
    )
    SELECT id, chunk_index, content, MAX(similarity) as similarity, 
           bool_or(id IN (SELECT id FROM vector_search)) as from_vector,
           bool_or(id IN (SELECT id FROM keyword_search)) as from_keyword
    FROM (SELECT * FROM vector_search UNION ALL SELECT * FROM keyword_search) combined
    GROUP BY id, chunk_index, content
    ORDER BY similarity DESC
    LIMIT 10`,
    ['how many companies he worked', dummyEmbedding, documentId]
  );
  
  console.log('Query: how many companies he worked');
  console.log('Retrieved Chunks:');
  result.rows.forEach(r => {
    console.log(`[Chunk ${r.chunk_index}] Sim: ${r.similarity} (Vec:${r.from_vector}, Key:${r.from_keyword})`);
    console.log(r.content.substring(0, 80).replace(/\n/g, ' ') + '...');
  });

  process.exit(0);
}
debug().catch(console.error);
