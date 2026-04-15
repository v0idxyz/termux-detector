;(function() {
  'use strict';

  /**
   * Termux Detection Script
   * Detects Termux-based bot traffic for IVT filtering.
   * Termux runs on Android but presents as a Linux CLI environment,
   * creating detectable inconsistencies vs. real Android browsers.
   */

  var signals = {};
  var score = 0;

  // ── 1. User Agent signals ────────────────────────────────────────────────
  var ua = navigator.userAgent || '';
  var uaLower = ua.toLowerCase();

  // Direct Termux UA strings
  if (/termux/i.test(ua)) {
    signals.ua_termux = true;
    score += 10;
  }

  // Termux often uses curl, wget, or python-requests as UA
  if (/^(curl|wget|python-requests|python-urllib|go-http-client|java\/|okhttp)/i.test(ua)) {
    signals.ua_cli_tool = true;
    score += 8;
  }

  // Linux on Android without mobile browser markers
  if (/linux/i.test(ua) && !/android|mobile|tablet|iphone|ipad/i.test(ua)) {
    signals.ua_linux_no_mobile = true;
    score += 4;
  }

  // Android claimed but no Chrome/Firefox/Samsung browser
  if (/android/i.test(ua) && !/chrome|firefox|samsung|opera|edge|silk/i.test(ua)) {
    signals.ua_android_no_browser = true;
    score += 5;
  }

  // ── 2. Browser API presence checks ──────────────────────────────────────
  // Termux running headless or via automation typically lacks these

  if (typeof window.chrome === 'undefined' && /chrome/i.test(ua)) {
    signals.chrome_ua_no_chrome_obj = true;
    score += 6;
  }

  if (typeof navigator.plugins === 'undefined' || navigator.plugins.length === 0) {
    signals.no_plugins = true;
    score += 2;
  }

  if (typeof navigator.languages === 'undefined' || navigator.languages.length === 0) {
    signals.no_languages = true;
    score += 3;
  }

  if (typeof navigator.connection === 'undefined') {
    signals.no_connection_api = true;
    score += 1;
  }

  // ── 3. Screen / display anomalies ───────────────────────────────────────
  // Termux CLI has no real display; headless Termux automation often reports 0x0

  if (screen.width === 0 || screen.height === 0) {
    signals.zero_screen = true;
    score += 8;
  }

  if (screen.colorDepth === 0 || screen.colorDepth === undefined) {
    signals.no_color_depth = true;
    score += 4;
  }

  // Very unusual screen ratio (not matching any real Android device)
  if (screen.width > 0 && screen.height > 0) {
    var ratio = screen.width / screen.height;
    if (ratio > 3 || ratio < 0.2) {
      signals.unusual_screen_ratio = true;
      score += 3;
    }
  }

  // ── 4. Touch / input anomalies ───────────────────────────────────────────
  // Termux on Android claims to be mobile but has no touch support in headless mode

  var claimsAndroid = /android/i.test(ua);
  var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (claimsAndroid && !hasTouch) {
    signals.android_no_touch = true;
    score += 7;
  }

  // ── 5. WebGL fingerprint ─────────────────────────────────────────────────
  // Termux headless environments typically have no GPU / software renderer only

  try {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      signals.no_webgl = true;
      score += 3;
    } else {
      var renderer = gl.getParameter(gl.RENDERER) || '';
      var vendor = gl.getParameter(gl.VENDOR) || '';
      // SwiftShader / llvmpipe = software renderer = headless
      if (/swiftshader|llvmpipe|softpipe|mesa offscreen|microsoft basic/i.test(renderer)) {
        signals.software_renderer = true;
        score += 7;
      }
      signals.webgl_renderer = renderer;
      signals.webgl_vendor = vendor;
    }
  } catch(e) {
    signals.webgl_error = true;
    score += 2;
  }

  // ── 6. Canvas fingerprint anomaly ───────────────────────────────────────
  // Headless environments produce blank or uniform canvases

  try {
    var c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    var ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cwm fjordbank glyphs vext quiz', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz', 4, 17);
    var dataUrl = c.toDataURL();
    // Blank canvas = no rendering
    if (dataUrl === 'data:,' || dataUrl.length < 100) {
      signals.blank_canvas = true;
      score += 6;
    }
  } catch(e) {
    signals.canvas_error = true;
    score += 2;
  }

  // ── 7. Automation / headless markers ────────────────────────────────────

  if (navigator.webdriver === true) {
    signals.webdriver = true;
    score += 10;
  }

  // Puppeteer/Playwright/Selenium artifacts sometimes left in Termux automation
  if (window._phantom || window.__nightmare || window.callPhantom) {
    signals.phantom = true;
    score += 10;
  }

  if (document.documentElement.getAttribute('webdriver')) {
    signals.webdriver_attr = true;
    score += 8;
  }

  // ── 8. Timing anomaly ───────────────────────────────────────────────────
  // Bots executing JS in Termux often have near-zero or unrealistically fast timing

  var t0 = performance.now();
  var sum = 0;
  for (var i = 0; i < 1000000; i++) { sum += i; }
  var elapsed = performance.now() - t0;

  signals.timing_ms = Math.round(elapsed);
  if (elapsed < 1) {
    // Unrealistically fast = mocked performance API
    signals.timing_too_fast = true;
    score += 5;
  }

  // ── 9. Font availability ─────────────────────────────────────────────────
  // Termux headless has no system fonts beyond monospace defaults

  try {
    var testFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'];
    var availableFonts = 0;
    var testCanvas = document.createElement('canvas');
    var testCtx = testCanvas.getContext('2d');
    var baseWidth = {};
    testCtx.font = '72px monospace';
    var baseW = testCtx.measureText('mmmmmmmmmml').width;
    testFonts.forEach(function(font) {
      testCtx.font = '72px ' + font + ', monospace';
      if (testCtx.measureText('mmmmmmmmmml').width !== baseW) {
        availableFonts++;
      }
    });
    signals.available_fonts = availableFonts;
    if (availableFonts === 0) {
      signals.no_system_fonts = true;
      score += 4;
    }
  } catch(e) {
    signals.font_check_error = true;
  }

  // ── Result ───────────────────────────────────────────────────────────────

  var result = {
    score: score,
    // Thresholds: >10 = suspicious, >20 = likely Termux/bot
    likely_termux: score >= 15,
    signals: signals,
    ua: ua,
  };

  // Expose globally for use by your IVT pipeline
  window.__termux_detect = result;

  // Optional: log to console for debugging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[TermuxDetect] score=' + score + ' likely=' + result.likely_termux, signals);
  }

  // Optional: beacon back to your IVT endpoint
  // Uncomment and set your endpoint:
  /*
  if (result.likely_termux) {
    var payload = JSON.stringify(result);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('https://your-ivt-endpoint/termux', payload);
    }
  }
  */

  return result;

})();