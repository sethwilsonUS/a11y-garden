import { describe, it, expect } from "vitest";
import { detectWaf, checkBqlNavigation } from "./waf-detector";

describe("detectWaf", () => {
  it("detects DataDome challenge page (small HTML)", () => {
    const html =
      '<html><head><title>Device Check</title></head><body><script src="https://captcha-delivery.com/c.js"></script></body></html>';
    const result = detectWaf(html, "Device Check", 403);
    expect(result).toEqual({ detected: true, type: "datadome" });
  });

  it("ignores DataDome monitoring on large real pages", () => {
    const html = "<html>" + "x".repeat(15_000) + "captcha-delivery.com</html>";
    const result = detectWaf(html, "My Real Page", 200);
    expect(result).toEqual({ detected: false, type: null });
  });

  it("detects Cloudflare challenge (cf-browser-verification)", () => {
    const html =
      '<html><head><title>Just a moment...</title></head><body class="cf-browser-verification"><div id="challenge-platform"></div></body></html>';
    const result = detectWaf(html, "Just a moment...", 403);
    expect(result).toEqual({ detected: true, type: "cloudflare" });
  });

  it("detects Cloudflare on small pages even without 403", () => {
    const html =
      '<html><head><title>Checking your browser</title></head><body><div class="cf-browser-verification">Please wait</div></body></html>';
    const result = detectWaf(html, "Checking your browser", 200);
    expect(result).toEqual({ detected: true, type: "cloudflare" });
  });

  it("detects Akamai 403 page", () => {
    const html =
      "<html><head><title>Access Denied</title></head><body>Access Denied - Akamai Reference#12345</body></html>";
    const result = detectWaf(html, "Access Denied", 403);
    expect(result).toEqual({ detected: true, type: "akamai" });
  });

  it("detects PerimeterX challenge (small page)", () => {
    const html =
      '<html><head><title>Security Check</title></head><body><div id="px-captcha"></div></body></html>';
    const result = detectWaf(html, "Security Check", 200);
    expect(result).toEqual({ detected: true, type: "perimeterx" });
  });

  it("detects HUMAN Security 'Press & Hold' overlay on large pages", () => {
    const html =
      "<html><head><title>Walmart</title></head><body>" +
      "x".repeat(50_000) +
      '<div class="human-challenge">Robot or human? PRESS &amp; HOLD</div>' +
      "</body></html>";
    const result = detectWaf(html, "Walmart", 200);
    expect(result).toEqual({ detected: true, type: "perimeterx" });
  });

  it("detects 'press and hold' variant on large pages", () => {
    const html =
      "<html><head><title>Shopping</title></head><body>" +
      "x".repeat(30_000) +
      "Activate and hold the button to confirm that you're human. Press and hold" +
      "</body></html>";
    const result = detectWaf(html, "Shopping", 200);
    expect(result).toEqual({ detected: true, type: "perimeterx" });
  });

  it("detects generic 403 with small body", () => {
    const html =
      "<html><head><title>Forbidden</title></head><body>403 Forbidden</body></html>";
    const result = detectWaf(html, "Forbidden", 403);
    expect(result).toEqual({ detected: true, type: "generic" });
  });

  it("allows large 403 pages with real titles (post-challenge redirect)", () => {
    const html =
      "<html><head><title>Welcome to Our Store</title></head><body>" +
      "x".repeat(15_000) +
      "</body></html>";
    const result = detectWaf(html, "Welcome to Our Store", 403);
    expect(result).toEqual({ detected: false, type: null });
  });

  it("returns clean for normal pages", () => {
    const html =
      "<html><head><title>My Website</title></head><body><h1>Hello</h1><p>Content</p></body></html>";
    const result = detectWaf(html, "My Website", 200);
    expect(result).toEqual({ detected: false, type: null });
  });

  it("detects blocked title patterns without specific WAF markers", () => {
    const html =
      "<html><head><title>Robot Check</title></head><body>Please verify you are human</body></html>";
    const result = detectWaf(html, "Robot Check", 200);
    expect(result).toEqual({ detected: true, type: "generic" });
  });

  it("detects 503 service unavailable as WAF", () => {
    const html =
      "<html><head><title>Service Unavailable</title></head><body>Please try again</body></html>";
    const result = detectWaf(html, "Service Unavailable", 503);
    expect(result).toEqual({ detected: true, type: "generic" });
  });
});

describe("checkBqlNavigation", () => {
  it("returns null for real content", () => {
    const html =
      "<html><head><title>Real Site</title></head><body>" +
      "<main><h1>Welcome</h1><p>Content here</p></main>" +
      "</body></html>";
    expect(checkBqlNavigation(html, "Real Site", 200)).toBeNull();
  });

  it("detects empty shell pages (tiny HTML, no title)", () => {
    const html = "<html><head></head><body><div id='root'></div></body></html>";
    const result = checkBqlNavigation(html, "", 200);
    expect(result).toEqual({ detected: true, type: "empty-shell" });
  });

  it("delegates to detectWaf for WAF pages", () => {
    const html =
      '<html><head><title>Access Denied</title></head><body>cf-browser-verification</body></html>';
    const result = checkBqlNavigation(html, "Access Denied", 403);
    expect(result).toEqual({ detected: true, type: "cloudflare" });
  });

  it("detects Chrome 'This site can't be reached' error page", () => {
    const html =
      '<html><head><title>www.imdb.com</title></head><body>' +
      '<div id="main-frame-error" class="neterror">' +
      "This site can't be reached" +
      "</div></body></html>";
    const result = checkBqlNavigation(html, "www.imdb.com", 0);
    expect(result).toEqual({ detected: true, type: "unreachable" });
  });

  it("detects unreachable by httpStatus 0 alone", () => {
    const html = "<html><head></head><body>something</body></html>";
    const result = checkBqlNavigation(html, "", 0);
    expect(result).toEqual({ detected: true, type: "unreachable" });
  });

  it("detects Chrome error page by content markers", () => {
    const html =
      "<html>" + "x".repeat(100_000) +
      "chrome-error://chromewebdata/" +
      "</html>";
    const result = checkBqlNavigation(html, "example.com", 200);
    expect(result).toEqual({ detected: true, type: "unreachable" });
  });
});
