const fetch = require('node-fetch');
const fs = require('fs');

async function testApi() {
  const htmlContent = "<p>Test paragraph</p>";
  
  try {
    const res = await fetch('http://localhost:3001/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlContent, title: "Test Doc" })
    });
    
    if (!res.ok) {
      console.error('API failed:', await res.text());
      return;
    }
    
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync('test-api.docx', Buffer.from(arrayBuffer));
    console.log('Success, wrote test-api.docx of size:', arrayBuffer.byteLength);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
testApi();
