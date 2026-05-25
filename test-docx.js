const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function test() {
  const html = '<h1>Test</h1><p>Hello world</p>';
  try {
    const fileBuffer = await HTMLtoDOCX(html, null, {
      title: 'Test',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    });
    fs.writeFileSync('test.docx', fileBuffer);
    console.log('Success, created test.docx of size:', fileBuffer.length);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
