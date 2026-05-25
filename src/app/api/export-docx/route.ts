import { NextResponse } from 'next/server';
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx';

export async function POST(req: Request) {
  try {
    const { html, title } = await req.json();
    
    // Add basic inline styles to the HTML so Word renders it nicely
    // Note: html-to-docx does not support full HTML documents with <head> and <style>
    const wrappedHtml = `
      <div style="font-family: 'Inter', sans-serif; font-size: 11pt; color: #333333; line-height: 1.5;">
        <h1 style="font-size: 16pt; font-weight: bold; color: #004D40; margin-bottom: 24pt;">${title}</h1>
        ${html}
      </div>
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
