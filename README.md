# Image → MP4 Converter

A progressive web app (PWA) that converts images to MP4 videos directly in your browser. No uploads. No server. Works on iPhone, iPad, and desktop.

## Features

- **Two modes**: Convert all images into one slideshow video, or one video per image
- **Duration control**: 3–10 seconds per image
- **Supports**: JPEG, PNG, WebP, GIF, HEIC (iPhone photos)
- **Offline capable**: Works after first load (cached via service worker)
- **Installable**: Add to Home Screen on iOS/Android

## Deploy to GitHub Pages

### One-time setup (do this once per repo)

1. Push this repo to GitHub
2. Go to **Settings → Pages → Build and deployment**
3. Set source to **GitHub Actions**
4. Push any commit to `main` — the workflow deploys automatically

Your app will be live at: `https://<username>.github.io/<repo-name>/`

### Local development

```bash
npm install
npm run dev
```

## How it works

- **ffmpeg.wasm** runs entirely in the browser — your images never leave your device
- **Single-thread mode** is used so no special server headers are required (works on GitHub Pages as-is)
- The video engine (~31 MB) is fetched from a CDN on first use and cached by the service worker for offline use

## Technical notes

- For best results in **All → 1 video** mode, use images with the same aspect ratio. Mixed orientations (portrait + landscape) will produce letterboxed/pillarboxed output.
- Very high-resolution images may take longer to encode — this is normal for browser-based video encoding.
- First conversion requires loading the video engine (~31 MB). Subsequent conversions are instant.
