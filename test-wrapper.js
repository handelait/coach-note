const HTMLtoDOCX = require('html-to-docx');
const fs = require('fs');

async function test() {
  const html = '<p>Hello world</p>';
  const title = 'Test';
  const wrappedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Inter', sans-serif; font-size: 11pt; color: #333333; line-height: 1.5; }
            h1 { font-size: 16pt; font-weight: bold; color: #004D40; margin-bottom: 24pt; }
            h2 { font-size: 14pt; font-weight: bold; color: #333333; margin-top: 18pt; margin-bottom: 8pt; }
            h3 { font-size: 13pt; font-weight: bold; color: #333333; margin-top: 14pt; margin-bottom: 6pt; }
            p { margin-bottom: 8pt; }
            ul { margin-bottom: 8pt; }
            li { margin-bottom: 4pt; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${html}
        </body>
      </html>
    `;
  try {
    const fileBuffer = await HTMLtoDOCX(wrappedHtml, null, {
      title: 'Test',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    });
    fs.writeFileSync('test-wrapper.docx', fileBuffer);
    console.log('Success, created test-wrapper.docx of size:', fileBuffer.length);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
