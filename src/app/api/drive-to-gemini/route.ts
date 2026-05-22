import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow enough time for Render worker to respond

export async function POST(req: Request) {
  try {
    const { action, fileId, apiKey } = await req.json();

    if (action !== 'start' || !fileId || !apiKey) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }

    const workerUrl = process.env.RENDER_WORKER_URL;
    if (!workerUrl) {
      return NextResponse.json({ 
        error: "Chưa cấu hình RENDER_WORKER_URL trên Vercel. Vui lòng thêm biến môi trường RENDER_WORKER_URL trỏ tới ứng dụng Render của bạn." 
      }, { status: 500 });
    }

    console.log(`[Vercel] Đang gửi yêu cầu bóc tách âm thanh sang Render Worker: ${workerUrl}`);

    // Call Render Worker to do the heavy lifting
    const workerRes = await fetch(`${workerUrl}/process-drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, apiKey })
    });

    if (!workerRes.ok) {
      const errorText = await workerRes.text();
      throw new Error(`Render Worker báo lỗi: ${errorText}`);
    }

    const jobData = await workerRes.json();
    
    // Render worker returns { uri, name, mimeType }
    return NextResponse.json({ status: 'completed', ...jobData });

  } catch (error: any) {
    console.error("Vercel Proxy Error:", error);
    return NextResponse.json({ error: error.message || "Đã xảy ra lỗi tại Vercel Proxy" }, { status: 500 });
  }
}
