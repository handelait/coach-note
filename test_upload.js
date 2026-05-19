const fetch = require('node-fetch');

async function run() {
  try {
    const fileId = "1HhwmipEv042kF_cvFEFdiX8x6cE3ZD7D";
    const apiKey = "AIzaSyCk9XDsGeBanwUStHgiO9rkgFjq7luZLeo";

    console.log("Getting Drive URL...");
    let driveUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    let driveRes = await fetch(driveUrl);
    
    const text = await driveRes.text();
    const actionMatch = text.match(/action=\"([^\"]+)\"/);
    let newUrl = actionMatch[1];
    if (!newUrl.startsWith("http")) newUrl = "https://drive.usercontent.google.com" + newUrl;
    
    const inputMatches = text.matchAll(/<input type=\"hidden\" name=\"([^\"]+)\" value=\"([^\"]*)\">/g);
    const params = new URLSearchParams();
    for (const match of inputMatches) params.append(match[1], match[2]);
    
    console.log("Fetching actual Drive file stream...");
    let finalRes = await fetch(newUrl + "?" + params.toString());
    
    const contentLength = finalRes.headers.get('content-length');
    console.log("Content-Length:", contentLength);

    console.log("Initializing Gemini Upload...");
    const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': contentLength,
        'X-Goog-Upload-Header-Content-Type': "video/mp4",
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName: "DriveTest" } })
    });

    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    console.log("Upload URL acquired:", !!uploadUrl);

    console.log("Starting pipe to Gemini...");
    const startTime = Date.now();
    
    // Test piping using stream
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
      },
      body: finalRes.body
    });

    const fileInfo = await uploadRes.json();
    console.log("Upload completed in", (Date.now() - startTime) / 1000, "seconds");
    console.log("Result:", fileInfo);

  } catch (e) {
    console.error("Error:", e);
  }
}
run();
