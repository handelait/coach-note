import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath.path);

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

    const mimeType = driveRes.headers.get('content-type') || "video/mp4";

    const jobId = Math.random().toString(36).substring(7);
    const tmpDir = os.tmpdir();

    const audioPath = path.join(tmpDir, `${jobId}.m4a`);
    
    const nodeStream = Readable.fromWeb(driveRes.body as any);

    await new Promise((resolve, reject) => {
        ffmpeg(nodeStream)
            .outputOptions('-vn') // no video
            .outputOptions('-acodec copy') // direct copy, no re-encoding (instant)
            .save(audioPath)
            .on('end', resolve)
            .on('error', reject);
    });

    const stats = fs.statSync(audioPath);
    const audioContentLength = stats.size.toString();

    const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': audioContentLength,
        'X-Goog-Upload-Header-Content-Type': "audio/mp4",
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: "DriveAudio-" + fileId } })
    });

    if (!initRes.ok) throw new Error("Gemini Init Failed: " + await initRes.text());

    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL");

    try {
      // Read audio as node stream, convert to web stream for fetch
      const audioStream = fs.createReadStream(audioPath);

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
        },
        // @ts-ignore
        body: Readable.toWeb(audioStream),
        // @ts-ignore
        duplex: 'half',
      });

      if (!uploadRes.ok) throw new Error("Upload to Gemini failed: " + await uploadRes.text());

      const fileInfo = await uploadRes.json();
      return {
        uri: fileInfo.file.uri,
        name: fileInfo.file.name,
        mimeType: "audio/mp4"
      };
    } finally {
      // Cleanup audio
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
}
