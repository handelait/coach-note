import { NextResponse } from 'next/server';
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx';

export async function POST(req: Request) {
  try {
    const { html, title } = await req.json();
    
    // Add basic styling wrapper to the HTML so Word renders it nicely
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

    const safeTitle = (title || 'CoachNote Recap').replace(/[<>&'"]/g, '');

    const fileBuffer = await HTMLtoDOCX(wrappedHtml, null, {
      title: safeTitle,
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
    });

    // Convert Node Buffer to Uint8Array for Next.js 14 compatibility
    const uint8Array = new Uint8Array(fileBuffer);

    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title || 'Recap')}.docx"`,
      },
    });
  } catch (error) {
    console.error("Docx generation error:", error);
    return NextResponse.json({ error: 'Failed to generate docx' }, { status: 500 });
  }
}
