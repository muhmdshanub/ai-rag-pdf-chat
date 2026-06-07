-- Add Full Text Search (FTS) vector column to the chunks table
-- This column automatically updates whenever content is inserted or updated.
ALTER TABLE chunks ADD COLUMN fts_vector tsvector 
GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

-- Create a GIN index on the new FTS column for fast keyword lookups
CREATE INDEX chunks_fts_idx ON chunks USING GIN (fts_vector);
