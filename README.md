# termux-detect.js
 
A lightweight client-side JavaScript IVT detection script that identifies traffic originating from [Termux](https://termux.dev) — an Android terminal emulator commonly used to run ad fraud bots, click farms, and automated impression scripts.
 
---
 
## Why Termux?
 
Termux allows fraudsters to run headless browser automation, curl-based impression scripts, and Python ad fraud tools directly from an Android device. Because Termux runs on real Android hardware it can bypass many server-side datacenter IP blocklists — the traffic originates from residential or mobile IPs and looks superficially legitimate.
 
The problem is that Termux automation creates **detectable inconsistencies** between what the environment claims to be (an Android mobile browser) and what it actually is (a headless CLI environment with no real display, no GPU, no touch, and no system fonts). This script exploits those inconsistencies.
 
---
 
## How It Works
 
The script runs entirely client-side and collects signals across nine detection layers. Each signal is weighted by confidence and contributes to a cumulative **fraud score**. A score of 15 or above is flagged as likely Termux/bot traffic.
 
### Detection Layers
 
#### 1. User Agent Analysis
The script examines `navigator.userAgent` for direct and indirect Termux markers.
 
- **Direct match** (`termux` in UA string) — score +10
- **CLI tool UAs** (`curl`, `wget`, `python-requests`, `okhttp` etc.) — score +8. Termux fraud scripts frequently forget to spoof the UA and send raw HTTP client strings.
- **Linux without mobile markers** — score +4. Termux reports `Linux` in the UA but lacks `Android`, `Mobile`, or any tablet identifier that a real Android browser would include.
- **Android claimed but no browser** — score +5. Every real Android browser (Chrome, Firefox, Samsung, Opera, Silk) includes its name in the UA. Termux automation often claims Android but omits the browser name.
 
#### 2. Browser API Presence
Real browsers expose a rich set of JavaScript APIs. Headless Termux environments either lack these entirely or expose them with empty/default values.
 
- **`window.chrome` absent despite Chrome UA** — score +6. Automation tools often fake a Chrome UA but don't implement the `window.chrome` object that real Chrome injects.
- **No plugins** — score +2. Real browsers have at least some plugins; headless environments have none.
- **No language list** — score +3. `navigator.languages` is empty in many headless contexts.
- **No Network Information API** — score +1. `navigator.connection` is absent in non-browser environments.
 
#### 3. Screen and Display Anomalies
Termux running headlessly has no physical display attached. Automation frameworks often report zero or impossible screen dimensions.
 
- **Zero screen dimensions** (`screen.width === 0` or `screen.height === 0`) — score +8
- **No color depth** — score +4
- **Impossible aspect ratio** (wider than 3:1 or taller than 5:1) — score +3. No real Android device has these proportions.
 
#### 4. Touch Input Anomalies
Android devices always support touch. A session claiming to be Android but lacking touch support (`ontouchstart`, `navigator.maxTouchPoints`) is running in a non-browser context.
 
- **Android UA + no touch events** — score +7
 
#### 5. WebGL Fingerprint
WebGL requires a GPU. Headless Termux automation has no real GPU and either lacks WebGL entirely or falls back to a software renderer.
 
- **WebGL absent** — score +3
- **Software renderer detected** (`SwiftShader`, `llvmpipe`, `Mesa Offscreen`, `Microsoft Basic Render Driver`) — score +7. These strings indicate the environment is using CPU-based rendering, a clear headless indicator.
 
The detected renderer and vendor strings are also stored in `signals.webgl_renderer` and `signals.webgl_vendor` for logging.
 
#### 6. Canvas Rendering
A real browser renders canvas text and shapes consistently. Headless environments with no rendering engine produce blank or near-empty canvas output.
 
The script draws a multi-colour text string onto a canvas and checks the resulting `dataURL`. A blank or suspiciously short output indicates no real rendering occurred.
 
- **Blank canvas output** — score +6
 
#### 7. Automation Framework Markers
Selenium, Puppeteer, Playwright, and PhantomJS — all commonly used in Termux automation setups — leave detectable artifacts in the browser environment.
 
- **`navigator.webdriver === true`** — score +10. This is set by WebDriver-controlled browsers and is the clearest automation signal available.
- **`document.documentElement` has `webdriver` attribute** — score +8
- **PhantomJS/Nightmare globals present** (`window._phantom`, `window.__nightmare`, `window.callPhantom`) — score +10
 
#### 8. Timing Anomaly
The script runs a simple CPU loop (summing 1,000,000 integers) and measures execution time using `performance.now()`. A real browser on real hardware takes at least 1ms. A mocked `performance` API or an environment that returns fabricated timestamps will return sub-millisecond results.
 
- **Loop completes in < 1ms** — score +5
 
The raw timing value is stored in `signals.timing_ms` for logging and analysis.
 
#### 9. Font Availability
Termux headless environments have no system font stack beyond monospace defaults. The script tests whether five common system fonts (`Arial`, `Helvetica`, `Times New Roman`, `Georgia`, `Verdana`) produce different glyph widths than the monospace baseline. If none of them do, no system fonts are installed.
 
- **Zero system fonts available** — score +4
 
---
 
## Score Thresholds
 
| Score | Interpretation |
|-------|----------------|
| 0–4 | Clean — normal browser traffic |
| 5–14 | Suspicious — worth logging, may include misconfigured browsers |
| 15–19 | Likely Termux / headless bot |
| 20+ | High confidence Termux / bot — block recommended |
 
---
 
## Output
 
The script exposes its result on `window.__termux_detect`:
 
```javascript
{
  score: 23,
  likely_termux: true,
  ua: "Mozilla/5.0 (Linux; Android 11) ...",
  signals: {
    ua_android_no_browser: true,
    android_no_touch: true,
    no_webgl: true,
    webdriver: true,
    timing_ms: 0,
    timing_too_fast: true,
    no_system_fonts: true,
    available_fonts: 0
  }
}
```
 
---
 
## Integration
 
### Standalone
Drop the script into any page. It executes immediately as an IIFE and writes the result to `window.__termux_detect`.