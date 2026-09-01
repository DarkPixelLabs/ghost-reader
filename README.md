# Ghost Reader

Ghost Reader is a browser-only screenshot leak scanner. Drop in an image, run OCR, review detected sensitive strings, black out selected findings, and download a clean PNG.

## Privacy

- The screenshot is processed in the browser with the Canvas API and Tesseract.js.
- Ghost Reader has no backend, database, account system, or image upload endpoint.
- Image pixels and extracted OCR text are not sent to an application server.
- Tesseract.js may download its JavaScript, worker, and language assets from the CDN on first use; those assets are the only network dependency for OCR.
- The original image is retained only in the current browser page so redaction can be re-run from the unmodified source.

Do not treat automated detection as a guarantee of privacy. Always review faces, names, private chats, and other context manually.

## Detection patterns

Detectors live in `detectors.js` and are intentionally separate for review:

- **Email:** common email address syntax.
- **Phone:** common international/local phone formats, with a 10–15 digit check to reduce false positives.
- **API key / secret:** known prefixes such as `sk-`, `ghp_`, `AIza`, and `AKIA`, plus 20+ character alphanumeric strings containing letters and digits.
- **IPv4:** dotted IPv4 addresses with every octet validated to 0–255.
- **Credit card:** 13–19 digit sequences with optional spaces/dashes, validated with Luhn.
- **Crypto wallet:** Bitcoin legacy/Bech32-style addresses and Ethereum `0x` addresses.

These are pattern-based detectors, not proof that a string is active or valid.

## Run locally

No build step is required. Serve the folder with any static file server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a current Chrome, Firefox, or Safari browser.

## GitHub Pages

Every push to `main` runs `.github/workflows/deploy.yml` and publishes the repository as a static GitHub Pages site. Enable GitHub Pages for the repository using **GitHub Actions** as the source if it is not already enabled.

## Scope

Included: single-image OCR, sensitive-data detection, word-level location, selectable black-box redaction, PNG download, responsive accessible UI.

Out of scope: face detection/blurring, batch processing, accounts/history, and a backend. Future work for these areas should be kept as explicit TODOs rather than silently added to the client-only design.

## Tech

Plain HTML, CSS, and vanilla JavaScript with Tesseract.js v5 from jsDelivr and the browser Canvas API. No build tooling or application server is required.
