# MapMotion Studio — Upload key setup (0.8.9)

The upload key must remain a Vercel Secret. Do **not** hard-code it into `frontend/app.js`, Python source, HTML, or a public GitHub repository. The repository `Shivam-Studio/mapweb` is public; a key in source would let anyone use the upload endpoint and consume or alter your GitHub LFS map storage.

## One-click Windows setup

1. Make sure this project folder is linked to Vercel (`.vercel/project.json` exists). The linked project should be `mapweb-p412`.
2. Double-click `SET_UPLOAD_KEY.bat`.
3. The helper generates a new random key locally, pipes it directly into Vercel as a hidden Secret for Production and Preview, and verifies the clipboard contains the exact same value. It never prints the key.
4. Redeploy Production after the helper finishes.
5. Refresh MapMotion Studio. At the upload-key prompt, press `Ctrl+V`, then submit.

If Windows cannot verify clipboard access, the helper stops before changing Vercel. Do not paste the generated key into chat.

## Authentication recovery

If the browser submits an old or incorrect key and receives HTTP 403, version 0.8.9 clears the in-memory key and prompts once more. Paste the current value copied by `SET_UPLOAD_KEY.bat`. The same retry logic is used for new-map upload, satellite upload, commit and alignment-verification requests.

## Why credentials are not embedded

A frontend or source-code secret is not secret: every visitor can inspect downloaded JavaScript, and this project's GitHub repository is public. Keep the GitHub token and upload key in Vercel Secret environment variables only.
