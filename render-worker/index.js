const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

// In-memory job store
const jobs = new Map();

app.post('/process-drive-start', async (req, res) => {
    const { fileId, apiKey } = req.body;
    if (!fileId || !apiKey) return res.status(400).json({ error: "Thiếu fileId hoặc apiKey" });

    const jobId = Math.random().toString(36).substring(7);
    jobs.set(jobId, { status: 'processing' });

    // Respond immediately to prevent Vercel 60s timeout
    res.json({ jobId });

    // Continue heavy processing in background
    runBackgroundJob(jobId, fileId, apiKey).catch(err => {
        console.error(`[${jobId}] Lỗi Background:`, err);
        jobs.set(jobId, { status: 'error', error: err.message });
    });
});

app.get('/process-drive-status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: "Không tìm thấy tiến trình" });
    res.json(job);
});

async function runBackgroundJob(jobId, fileId, apiKey) {
    const tmpDir = os.tmpdir();
    const videoPath = path.join(tmpDir, `${jobId}.mp4`);
    const audioPath = path.join(tmpDir, `${jobId}.m4a`);

    try {
        console.log(`[${jobId}] Đang tải video từ Google Drive...`);
        let driveUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
        let driveRes = await fetch(driveUrl);
        
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
                driveRes = await fetch(newUrl + "?" + params.toString());
            } else {
                throw new Error("Không thể vượt qua xác thực Drive. Hãy đảm bảo link đã cấp quyền 'Bất kỳ ai có liên kết đều xem được'.");
            }
        }

        if (!driveRes.ok) {
            throw new Error(`Google Drive lỗi: ${await driveRes.text()}`);
        }
        
        await pipeline(Readable.fromWeb(driveRes.body), fs.createWriteStream(videoPath));
        console.log(`[${jobId}] Tải video hoàn tất. Đang cắt âm thanh...`);

        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions('-vn')
                .outputOptions('-acodec copy')
                .save(audioPath)
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`[${jobId}] Cắt âm thanh hoàn tất. Đang gửi lên Gemini...`);

        const stats = fs.statSync(audioPath);
        const audioContentLength = stats.size.toString();
        const mimeType = "audio/mp4";

        const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': audioContentLength,
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file: { displayName: "DriveAudio-" + fileId } })
        });

        if (!initRes.ok) throw new Error("Gemini Init Failed: " + await initRes.text());

        const uploadUrl = initRes.headers.get('x-goog-upload-url');
        if (!uploadUrl) throw new Error("Không nhận được upload URL từ Gemini");

        const audioStream = fs.createReadStream(audioPath);

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
            },
            body: Readable.toWeb(audioStream),
            duplex: 'half',
        });

        if (!uploadRes.ok) throw new Error("Upload to Gemini failed: " + await uploadRes.text());

        const fileInfo = await uploadRes.json();
        console.log(`[${jobId}] Hoàn tất toàn bộ quy trình thành công!`);

        jobs.set(jobId, {
            status: 'completed',
            data: { uri: fileInfo.file.uri, name: fileInfo.file.name, mimeType: mimeType }
        });

    } catch (error) {
        console.error(`[${jobId}] Lỗi:`, error);
        jobs.set(jobId, { status: 'error', error: error.message });
    } finally {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Worker đang chạy tại cổng ${PORT}`);
});

