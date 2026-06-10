/**
 * Comprehensive RAG System Test Suite
 *
 * Tests all question types against both documents:
 *   - Resume PDF (dense, bullet-heavy)
 *   - Space Exploration PDF (narrative)
 *
 * Question types covered:
 *   Direct, Indirect, Clubbed, Negative/Out-of-scope,
 *   Conversational follow-up, Ambiguous, and the specific
 *   "how many companies" bug that triggered the enterprise fixes.
 */

const BASE_URL = 'http://localhost:5000/api';

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.json();
}

function uploadFile(filePath) {
  const { execSync } = require('child_process');
  const result = execSync(
    `curl.exe -s -X POST -F "file=@${filePath}" ${BASE_URL}/upload`,
    { encoding: 'utf-8' }
  );
  return JSON.parse(result);
}

async function waitForProcessing(documentId, maxWaitMs = 60000) {
  const start = Date.now();
  process.stdout.write('  Processing');
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await get('/documents');
    const doc = res.data?.documents?.find(d => d.id === documentId);
    if (!doc) { console.log(' NOT FOUND'); return false; }
    if (doc.status === 'completed') { console.log(` ✅ Done (${doc.total_chunks} chunks)`); return true; }
    if (doc.status === 'failed' || doc.status === 'error') { console.log(` ❌ Failed`); return false; }
    process.stdout.write('.');
  }
  console.log(' ⏰ Timeout');
  return false;
}

async function ask(documentId, question) {
  const res = await post('/chat', { documentId, message: question });
  return {
    answer: res.data?.answer || res.error || JSON.stringify(res),
    tokens: res.data?.tokensUsed,
  };
}

function grade(answer, expected) {
  if (!expected) return '⚪ N/A';
  const a = answer.toLowerCase();
  const keywords = Array.isArray(expected) ? expected : [expected];
  const allFound = keywords.every(kw => a.includes(kw.toLowerCase()));
  return allFound ? '✅ PASS' : '❌ FAIL';
}

async function runDocumentTest(label, filePath, questions) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📄 ${label}`);
  console.log(`${'═'.repeat(70)}`);

  // Upload
  console.log(`\n[Upload] ${filePath}`);
  const uploadRes = uploadFile(filePath);
  const docId = uploadRes.data?.document?.id;
  if (!docId) { console.log('❌ Upload failed:', uploadRes); return; }
  console.log(`  Document ID: ${docId}`);

  // Wait
  const ready = await waitForProcessing(docId);
  if (!ready) return;

  // Ask questions
  console.log(`\n[Questions]\n`);
  let passed = 0, total = 0;

  for (const q of questions) {
    total++;
    console.log(`Q${total} [${q.type.toUpperCase()}]`);
    console.log(`  ❓ ${q.question}`);
    if (q.expected) console.log(`  📌 Expected: ${Array.isArray(q.expected) ? q.expected.join(' AND ') : q.expected}`);

    const { answer, tokens } = await ask(docId, q.question);
    const result = grade(answer, q.expected);
    if (result === '✅ PASS') passed++;

    console.log(`  🤖 ${answer}`);
    console.log(`  ${result}  📊 Tokens: ${JSON.stringify(tokens)}`);
    console.log();
  }

  console.log(`\n📊 Score: ${passed}/${total} passed`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║         COMPREHENSIVE RAG SYSTEM TEST — ALL FEATURES               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // ── TEST 1: RESUME (dense, bullet-heavy) ──────────────────────────────────
  await runDocumentTest('RESUME PDF — Dense Document Test', 'muhammed_shanoob_ak_25_04_2026.pdf', [
    {
      type: 'direct',
      question: "What is Muhammed Shanoob's email address and phone number?",
      expected: ['muhmdshanoob@gmail.com', '8157882662'],
    },
    {
      type: 'direct',
      question: 'Where did he complete his B.Tech degree and what was his CGPA?',
      expected: ['Adoor', '6.6'],
    },
    {
      type: 'direct',
      question: 'What was his job title at Urolime Technologies?',
      expected: ['TechOps'],
    },
    {
      type: 'indirect',
      question: 'What messaging system did he use for asynchronous inter-service communication?',
      expected: ['RabbitMQ'],
    },
    {
      type: 'indirect',
      question: 'Which in-memory data store did he use for caching and real-time tracking?',
      expected: ['Redis'],
    },
    {
      type: 'clubbed',
      question: 'What are the main features of the Vergno platform and what tech stack powered it?',
      expected: ['Vergno', 'Socket.IO'],
    },
    {
      type: 'clubbed',
      question: 'Describe the architecture of Teams Meet Manager including the database and messaging layers.',
      expected: ['PostgreSQL', 'RabbitMQ'],
    },
    {
      type: 'bug-regression',
      question: 'How many companies has he worked at and what are their names?',
      expected: ['Urolime', 'Packapeer'],
    },
    {
      type: 'negative',
      question: 'What is his current monthly salary expectation?',
      expected: null, // Expect a graceful "I don't know" — no keyword to check
    },
    {
      type: 'negative',
      question: 'What is his LinkedIn profile URL?',
      expected: null,
    },
  ]);

  // ── TEST 2: SPACE EXPLORATION (narrative) — REGRESSION ───────────────────
  await runDocumentTest('SPACE EXPLORATION PDF — Narrative Regression Test', 'test_space_exploration.pdf', [
    {
      type: 'direct',
      question: 'Who were the astronauts that stepped onto the lunar surface during Apollo 11?',
      expected: ['Armstrong', 'Aldrin'],
    },
    {
      type: 'direct',
      question: 'When did Voyager 1 enter interstellar space?',
      expected: ['2012'],
    },
    {
      type: 'indirect',
      question: 'Which planet in our solar system gets its color from iron oxide?',
      expected: ['Mars'],
    },
    {
      type: 'indirect',
      question: 'What is the distance equivalent of one light-year in miles?',
      expected: ['5.88 trillion'],
    },
    {
      type: 'clubbed',
      question: 'Tell me the distance of a light-year in miles and also when Voyager 1 entered interstellar space.',
      expected: ['5.88 trillion', '2012'],
    },
    {
      type: 'negative',
      question: 'What is the recipe for making a chocolate cake?',
      expected: null,
    },
  ]);

  console.log(`\n${'═'.repeat(70)}`);
  console.log('🏁 ALL TESTS COMPLETE');
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(console.error);
