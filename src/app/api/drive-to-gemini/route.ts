import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { action, fileId, apiKey } = await req.json();

    if (action === 'start') {
      if (!fileId || !apiKey) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      
      const result = await runBackgroundUpload(fileId, apiKey);
      return NextResponse.json({ status: 'completed', ...result });
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function runBackgroundUpload(fileId: string, apiKey: string) {
    
    let driveUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    let driveRes = await fetch(driveUrl, { cache: 'no-store' });
    
    const contentType = driveRes.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      const text = await driveRes.text();
      const actionMatch = text.match(/action="([^"]+)"/);
      if (actionMatch) {
        let newUrl = actionMatch[1];
        if (!newUrl.startsWith("http")) {
          newUrl = "https://drive.usercontent.google.com" + newUrl;
        }
        const inputMatches = text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g);
        const params = new URLSearchParams();
        for (const match of Array.from(inputMatches)) {
          params.append(match[1], match[2]);
        }
        driveRes = await fetch(newUrl + "?" + params.toString(), { cache: 'no-store' });
      } else {
        throw new Error("Không thể vượt qua xác thực Drive. Hãy đảm bảo link đã cấp quyền 'Bất kỳ ai có liên kết đều xem được'.");
      }
    }

    if (!driveRes.ok) throw new Error("Lỗi khi tải file từ Google Drive.");

    const contentLength = driveRes.headers.get('content-length');
    const mimeType = driveRes.headers.get('content-type') || "video/mp4";

    const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        ...(contentLength ? { 'X-Goog-Upload-Header-Content-Length': contentLength } : {}),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: "DriveFile-" + fileId } })
    });

    if (!initRes.ok) throw new Error("Gemini Init Failed: " + await initRes.text());

    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL");

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
      },
      // @ts-ignore
      body: driveRes.body,
      // @ts-ignore
      duplex: 'half',
    });

    if (!uploadRes.ok) throw new Error("Upload to Gemini failed: " + await uploadRes.text());

    const fileInfo = await uploadRes.json();
    return {
      uri: fileInfo.file.uri,
      name: fileInfo.file.name,
      mimeType: mimeType
    };
}
