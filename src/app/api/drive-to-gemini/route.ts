import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    const workerUrl = process.env.RENDER_WORKER_URL;
    if (!workerUrl) {
      return NextResponse.json({ 
        error: "Chưa cấu hình RENDER_WORKER_URL trên Vercel." 
      }, { status: 500 });
    }

    if (action === 'start') {
      const { fileId, apiKey } = body;
      const workerRes = await fetch(`${workerUrl}/process-drive-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, apiKey })
      });
      if (!workerRes.ok) throw new Error(await workerRes.text());
      const jobData = await workerRes.json();
      return NextResponse.json(jobData);
    } 
    
    if (action === 'status') {
      const { jobId } = body;
      const workerRes = await fetch(`${workerUrl}/process-drive-status/${jobId}`);
      if (!workerRes.ok) throw new Error(await workerRes.text());
      const statusData = await workerRes.json();
      return NextResponse.json(statusData);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Vercel Proxy Error:", error);
    return NextResponse.json({ error: error.message || "Lỗi Proxy" }, { status: 500 });
  }
}
