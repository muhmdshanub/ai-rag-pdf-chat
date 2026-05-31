const fs = require('fs');
const pdf = require('pdf-parse');
const pdf2img = require('pdf-img-convert');
const Tesseract = require('tesseract.js');

async function testOCR() {
  console.log('Reading file...');
  const buffer = fs.readFileSync('uploads/1780199772442-adhar_compressed.pdf');
  
  const flaggedPages = [];

  const options = {
    pagerender: async function(pageData) {
      const render_options = {
          normalizeWhitespace: false,
          disableCombineTextItems: false
      }
      
      const textContent = await pageData.getTextContent(render_options);
      let lastY, text = '';
      for (let item of textContent.items) {
          if (lastY == item.transform[5] || !lastY){
              text += item.str;
          }  
          else{
              text += '\n' + item.str;
          }    
          lastY = item.transform[5];
      }
      
      // Deep Inspection
      if (text.trim().length < 50) {
        const ops = await pageData.getOperatorList();
        // check for paintImageXObject (usually 85, but let's just check for >80 and <90 or just log it)
        const hasImage = ops.fnArray.some(op => op >= 80 && op <= 85);
        if (hasImage) {
          console.log(`Page ${pageData.pageIndex} has an image! Flagging for OCR.`);
          return `___OCR_PAGE_${pageData.pageIndex}___`;
        }
      }
      
      return text;
    }
  };

  console.log('Parsing PDF...');
  const data = await pdf(buffer, options);
  let finalString = data.text;
  
  // Extract OCR pages
  const ocrMatches = finalString.match(/___OCR_PAGE_(\d+)___/g);
  if (ocrMatches) {
    console.log(`Found ${ocrMatches.length} pages to OCR.`);
    
    // Setup Tesseract worker
    const worker = await Tesseract.createWorker('eng');
    
    for (const match of ocrMatches) {
      const pageIndex = parseInt(match.replace(/[^0-9]/g, ''));
      const pageNum = pageIndex + 1; // pdf-img-convert is 1-indexed
      console.log(`Converting page ${pageNum} to image...`);
      
      const images = await pdf2img.convert(buffer, { page_numbers: [pageNum] });
      const imgBuffer = Buffer.from(images[0]);
      
      console.log(`Running OCR on page ${pageNum}...`);
      const { data: { text } } = await worker.recognize(imgBuffer);
      
      console.log(`OCR Text for page ${pageNum}:`, text.substring(0, 100).replace(/\n/g, ' '));
      
      finalString = finalString.replace(match, '\n' + text + '\n');
    }
    
    await worker.terminate();
  }
  
  console.log('\nFinal Text length:', finalString.length);
  fs.writeFileSync('test-ocr-output.txt', finalString);
}

testOCR().catch(console.error);
