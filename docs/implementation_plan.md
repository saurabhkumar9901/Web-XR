# Local WiFi Video Streaming to VR / Smartphone

Stream videos from the local `videos/` directory to devices (VR headset, smartphone) on the same WiFi network at **192.168.29.15**, with HTTPS for full WebXR support.

## Decisions (Confirmed)

- **Static IP:** `192.168.29.15`
- **HTTPS:** mkcert + nginx reverse proxy included
- **Environment strategy:** Option B — update existing `nature_snow` to use local video

---

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Smartphone /   │  HTTPS  │   nginx (443)     │  HTTP   │  bot.py (8001)   │
│   VR Headset     │ ──────► │   reverse proxy   │ ──────► │  FastAPI + WS    │
│  192.168.29.x    │         │   192.168.29.15   │         │  localhost:8001  │
└──────────────────┘         │                   │         │                  │
                             │  • SSL termination│         │  /stream/{file}  │
                             │  • WSS → WS proxy │         │  /client/...     │
                             │  • /ws upgrade    │         │  /ws             │
                             └──────────────────┘         └──────────────────┘
```

---

## Proposed Changes

### Component 1: Backend — Video Streaming Endpoint

#### [MODIFY] [bot.py](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/bot.py)

**Add after line 324** (after `app.mount("/client", ...)`). No existing code touched.

1. **`/stream/{filename}` endpoint** — Serves video files from `videos/` with full HTTP Range support:
   - Returns `206 Partial Content` for range requests (required by mobile browsers for video seeking)
   - Returns `200 OK` with full file for non-range requests
   - Proper `Content-Type`, `Accept-Ranges`, `Content-Range` headers
   - Streams in 8KB chunks to avoid memory issues with 400MB+ files

2. **`/network-info` endpoint** — Returns the server's LAN IP for client auto-detection:
   ```json
   {"ip": "192.168.29.15", "port": 8001, "https_port": 443}
   ```

3. **`/videos-list` endpoint** — Lists available local video files for the test page.

---

### Component 2: Environment Configuration

#### [MODIFY] [environments.json](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/client/environments.json)

Update the **existing** `nature_snow` entry's `videoSrc` from the CDN URL to the local stream path:

```diff
 {
   "sub_type": "nature_snow",
   "category": "nature",
   "title": "Snow Mountain",
   "description": "Cool air, vast peaks, and stillness.",
-  "videoSrc": "https://aura-cdn.b-cdn.net/Everest%2016K.%20..."
+  "videoSrc": "/stream/Everest 16K. Aerial 360° video trailer in 8K [PnfJDgS9VZc]_monoscopic_2d_fixed.mp4"
 }
```

The relative `/stream/...` URL will auto-resolve to the correct origin whether accessed from `localhost` or `192.168.29.15`.

---

### Component 3: Client — Relative URL Resolution

#### [MODIFY] [script.js](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/client/script.js)

In `_loadEnvironmentConfig()` (~line 274), update the `videoSrc` resolution to handle relative paths starting with `/`:

```javascript
videoSrc: env.videoSrc.startsWith('http')
  ? env.videoSrc
  : env.videoSrc.startsWith('/')
    ? window.location.origin + env.videoSrc
    : (config.cdn_base_url ? ... : env.videoSrc)
```

This is a 3-line change. All existing `http://` CDN URLs pass through unchanged.

---

### Component 4: HTTPS Reverse Proxy (mkcert + nginx)

#### [NEW] [nginx/](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/nginx/) directory

Create a `nginx/` directory with:

#### [NEW] nginx/nginx.conf

nginx configuration that:
- Listens on `443` (HTTPS) with the mkcert certificate for `192.168.29.15`
- Proxies all HTTP traffic to `localhost:8001`
- Upgrades `/ws` to WebSocket (`wss:// → ws://`)
- Large `client_max_body_size` for video streaming
- Proper proxy headers for correct origin detection

#### [NEW] nginx/setup_https.ps1

PowerShell script that automates the entire setup:
1. Checks if `mkcert` is installed (prompts to install via `winget` if not)
2. Installs the local CA to the system trust store (`mkcert -install`)
3. Generates a certificate for `192.168.29.15` 
4. Checks if nginx is installed (prompts to install if not)
5. Copies the config and starts nginx
6. Prints the access URL: `https://192.168.29.15/client/index.html`

> [!IMPORTANT]
> **Phone trust:** After running the setup, you'll need to install the mkcert root CA on your smartphone too. The script will show the path to the CA certificate file. You transfer it to your phone and install it in Settings → Security → Install Certificate.

---

### Component 5: Stream Test Page

#### [NEW] [client/stream-test.html](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/client/stream-test.html)

A minimal standalone HTML page for verifying streaming works on your phone:
- Shows the access URL (`https://192.168.29.15/client/stream-test.html`)
- Lists available local videos from `/videos-list`
- Embedded `<video>` player with native controls
- Network diagnostics (checks if byte-range works, measures bandwidth)
- No dependencies on the main Aura app

---

### Component 6: One-Click Launcher

#### [NEW] [start_local.ps1](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/start_local.ps1)

A convenience PowerShell script that:
1. Starts the Python backend (`python bot.py`)
2. Starts nginx (if HTTPS is set up)
3. Prints access URLs for both HTTP and HTTPS
4. Handles graceful shutdown of both processes

---

## Summary of All Changes

| File | Action | Risk | Description |
|------|--------|------|-------------|
| [bot.py](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/bot.py) | MODIFY | 🟢 Low | Add streaming + info endpoints (appended, no existing code touched) |
| [environments.json](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/client/environments.json) | MODIFY | 🟡 Med | Change `nature_snow` videoSrc from CDN → local (reversible) |
| [script.js](file:///d:/Saurabh's%20Workflow/ai%20assistant/ai%20assistant/client/script.js) | MODIFY | 🟢 Low | 3-line URL resolution fix |
| nginx/nginx.conf | NEW | 🟢 None | nginx reverse proxy config |
| nginx/setup_https.ps1 | NEW | 🟢 None | mkcert + nginx setup automation |
| client/stream-test.html | NEW | 🟢 None | Standalone video test page |
| start_local.ps1 | NEW | 🟢 None | One-click launcher |

**Untouched:** `index.html`, `vr-init.js`, `vr-system.js`, `Dockerfile`, `requirements.txt`, `.env`

---

## Verification Plan

### Automated Tests
1. Start server: `python bot.py`
2. Byte-range check: `curl -I -H "Range: bytes=0-1023" http://localhost:8001/stream/<filename>` → `206`
3. Network info: `curl http://localhost:8001/network-info` → `{"ip": "192.168.29.15", ...}`
4. Local browser: `http://localhost:8001/client/stream-test.html` → video plays

### Manual (Smartphone on WiFi)
1. Run `nginx/setup_https.ps1` → HTTPS active
2. Install mkcert CA on phone
3. Open `https://192.168.29.15/client/stream-test.html` → video streams
4. Open `https://192.168.29.15/client/index.html` → full Aura flow
5. Select "Snow Mountain" → video streams from local PC
6. Verify WebSocket (voice) works over WSS
