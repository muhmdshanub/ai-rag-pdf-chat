const { execSync } = require('child_process');

function runCurl(command) {
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    return JSON.parse(result);
  } catch (error) {
    console.error('Command failed:', command);
    console.error(error.stdout);
    process.exit(1);
  }
}

async function testChat(documentId, question) {
  const response = await fetch('http://localhost:5000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, message: question })
  });
  return await response.json();
}

async function runTest() {
  console.log('--- STARTING RAG SYSTEM TEST: RESUME EDITION ---');
  
  // 1. Upload File
  console.log('\n[1] Uploading muhammed_shanoob_ak_25_04_2026.pdf...');
  const uploadCmd = `curl.exe -s -X POST -F "file=@muhammed_shanoob_ak_25_04_2026.pdf" http://localhost:5000/api/upload`;
  const uploadResponse = runCurl(uploadCmd);
  
  if (!uploadResponse.success || !uploadResponse.data || !uploadResponse.data.document || !uploadResponse.data.document.id) {
    console.error('Upload failed:', uploadResponse);
    process.exit(1);
  }
  
  const documentId = uploadResponse.data.document.id;
  console.log(`✅ Upload successful. Document ID: ${documentId}`);

  // 2. Poll Status
  console.log('\n[2] Waiting for background processing (Chunking & Vectoring)...');
  let status = 'processing';
  while (status === 'processing' || status === 'pending') {
    const statusCmd = `curl.exe -s http://localhost:5000/api/documents`;
    const statusResponse = runCurl(statusCmd);
    const doc = statusResponse.data.documents.find(d => d.id === documentId);
    
    if (!doc) {
      console.error('Document not found in list!');
      process.exit(1);
    }
    
    status = doc.status;
    if (status === 'completed') {
      console.log(`✅ Processing completed. Total chunks generated: ${doc.total_chunks || 'unknown'}`);
      break;
    } else if (status === 'error' || status === 'failed') {
      console.error('❌ Processing failed for document.');
      process.exit(1);
    }
    
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 3. Ask Questions
  const questions = [
    "What is Muhammed Shanoob's email address and phone number?",
    "How many years of professional experience does he have?",
    "What was his job title at Urolime Technologies and what were his responsibilities?",
    "Name five backend technologies or tools he is proficient in.",
    "Describe the architecture of the Teams Meet Manager project.",
    "How did he use RabbitMQ in his projects?",
    "Where did he complete his B.Tech degree and what was his CGPA?",
    "What are the main features of the Vergno platform?",
    "Which cloud providers (e.g., AWS, GCP) has he worked with?",
    "Is he open to working remotely?"
  ];

  console.log('\n[3] Asking 10 specific questions about the resume...\n');

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`Q${i + 1}: ${q}`);
    const res = await testChat(documentId, q);
    console.log(`🤖 AI Response: "${res.data?.answer || res.error || JSON.stringify(res)}"`);
    console.log(`📊 Tokens Used: ${JSON.stringify(res.data?.tokensUsed) || 'unknown'}\n`);
  }

  console.log('--- TEST COMPLETE ---');
}

runTest();
