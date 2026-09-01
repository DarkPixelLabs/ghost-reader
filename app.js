// Ghost Reader is browser-only. Images and extracted text stay in this page; no app data is uploaded.

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const dropZone = document.getElementById("dropZone");
const chooseBtn = document.getElementById("chooseBtn");
const fileInput = document.getElementById("fileInput");
const fileError = document.getElementById("fileError");
const canvas = document.getElementById("canvas");
const canvasPlaceholder = document.getElementById("canvasPlaceholder");
const scanBtn = document.getElementById("scanBtn");
const status = document.getElementById("status");
const progressWrap = document.getElementById("progressWrap");
const progress = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const results = document.getElementById("results");
const resultsList = document.getElementById("resultsList");
const emptyState = document.getElementById("emptyState");
const redactBtn = document.getElementById("redactBtn");
const downloadBtn = document.getElementById("downloadBtn");

const state = window.ghostReader = window.ghostReader || {
  originalImage: null,
  currentObjectUrl: null,
  ocrData: null,
  findings: [],
  selectedFindings: [],
  imageName: "",
  redactionApplied: false,
  highlightTimer: null
};

function showError(message) {
  fileError.textContent = message;
  fileError.hidden = false;
}

function clearError() {
  fileError.textContent = "";
  fileError.hidden = true;
}

function validateFile(file) {
  if (!file) return "Choose an image file to continue.";
  if (!ALLOWED_TYPES.has(file.type)) return "Unsupported image type. Use PNG, JPG, JPEG, or WebP.";
  if (file.size > MAX_FILE_BYTES) return "Image is too large. Please choose a file up to 15 MB.";
  return "";
}

function drawImage(image) {
  const maxWidth = Math.max(1, canvas.parentElement.clientWidth - 56);
  const maxHeight = Math.max(1, canvas.parentElement.clientHeight - 56);
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, width, height);
  canvas.style.display = "block";
  canvasPlaceholder.hidden = true;
}

function drawRedactions(findings) {
  if (!state.originalImage) return;
  drawImage(state.originalImage);
  const scaleX = canvas.width / state.originalImage.naturalWidth;
  const scaleY = canvas.height / state.originalImage.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#050505";

  for (const finding of findings) {
    for (const box of finding.boxes || []) {
      const paddingX = Math.max(3, 4 * scaleX);
      const paddingY = Math.max(2, 3 * scaleY);
      const x = Math.max(0, box.x0 * scaleX - paddingX);
      const y = Math.max(0, box.y0 * scaleY - paddingY);
      const right = Math.min(canvas.width, box.x1 * scaleX + paddingX);
      const bottom = Math.min(canvas.height, box.y1 * scaleY + paddingY);
      ctx.fillRect(x, y, right - x, bottom - y);
    }
  }
}

function highlightFinding(finding) {
  if (!state.originalImage || !finding?.boxes?.length) return;
  window.clearTimeout(state.highlightTimer);
  drawImage(state.originalImage);

  const scaleX = canvas.width / state.originalImage.naturalWidth;
  const scaleY = canvas.height / state.originalImage.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(193, 68, 60, 0.22)";
  ctx.strokeStyle = "#c1443c";
  ctx.lineWidth = 2;
  for (const box of finding.boxes) {
    const x = box.x0 * scaleX;
    const y = box.y0 * scaleY;
    const width = Math.max(2, (box.x1 - box.x0) * scaleX);
    const height = Math.max(2, (box.y1 - box.y0) * scaleY);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  state.highlightTimer = window.setTimeout(() => {
    if (state.redactionApplied) drawRedactions(state.selectedFindings);
    else drawImage(state.originalImage);
  }, 1400);
}

function truncateMatch(value, maxLength = 64) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function renderResults() {
  results.hidden = false;
  resultsList.replaceChildren();
  downloadBtn.hidden = !state.redactionApplied;

  if (!state.findings.length) {
    emptyState.hidden = false;
    redactBtn.disabled = true;
    return;
  }

  emptyState.hidden = true;
  redactBtn.disabled = false;
  const groups = new Map();
  state.findings.forEach((finding, index) => {
    if (!groups.has(finding.type)) groups.set(finding.type, []);
    groups.get(finding.type).push({ finding, index });
  });

  for (const [, entries] of groups) {
    const group = document.createElement("section");
    group.className = "finding-group";
    const heading = document.createElement("h3");
    heading.textContent = `${entries[0].finding.label}: ${entries.length}`;
    group.appendChild(heading);

    for (const { finding, index } of entries) {
      const row = document.createElement("div");
      row.className = "finding";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.id = `finding-${index}`;
      checkbox.dataset.findingIndex = String(index);
      checkbox.setAttribute("aria-label", `Redact ${finding.label}: ${finding.text}`);

      const label = document.createElement("label");
      label.className = "match";
      label.htmlFor = checkbox.id;
      label.textContent = truncateMatch(finding.text);
      label.title = finding.text;

      const locate = document.createElement("button");
      locate.type = "button";
      locate.className = "locate";
      locate.textContent = "Locate";
      locate.addEventListener("click", () => highlightFinding(finding));

      row.append(checkbox, label, locate);
      group.appendChild(row);
    }
    resultsList.appendChild(group);
  }
}

function getCheckedFindings() {
  return [...resultsList.querySelectorAll("input[type=checkbox]:checked")]
    .map((input) => state.findings[Number(input.dataset.findingIndex)])
    .filter(Boolean);
}

function setProgress(value, label) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  progress.value = percent;
  progressPercent.textContent = `${percent}%`;
  progressText.textContent = label;
}

function mapDetectionsToWordBoxes(ocrData, findings) {
  const text = ocrData?.text || "";
  const words = Array.isArray(ocrData?.words) ? ocrData.words : [];
  const spans = [];
  let cursor = 0;
  const lowerText = text.toLowerCase();

  for (const word of words) {
    const value = String(word.text || "").trim();
    if (!value) continue;
    const lowerValue = value.toLowerCase();
    let start = lowerText.indexOf(lowerValue, cursor);
    if (start < 0) {
      const compactText = text.replace(/\s+/g, " ").toLowerCase();
      const compactValue = value.replace(/\s+/g, " ").toLowerCase();
      const compactStart = compactText.indexOf(compactValue);
      if (compactStart >= 0) start = compactStart;
    }
    if (start < 0) continue;
    const end = start + value.length;
    spans.push({ start, end, bbox: word.bbox, text: value, confidence: word.confidence });
    cursor = end;
  }

  return findings.map((finding) => ({
    ...finding,
    boxes: spans.filter((span) => span.start < finding.end && span.end > finding.start).map((span) => span.bbox).filter(Boolean)
  }));
}

function redactSelected() {
  if (!state.originalImage) return;
  const selected = getCheckedFindings();
  state.selectedFindings = selected;
  state.redactionApplied = true;
  window.clearTimeout(state.highlightTimer);
  drawRedactions(selected);
  downloadBtn.hidden = false;
  status.textContent = selected.length
    ? `${selected.length} finding${selected.length === 1 ? "" : "s"} redacted. The original remains available for re-redaction.`
    : "No findings selected. The image was left unchanged.";
}

function downloadCurrentCanvas() {
  if (!state.redactionApplied || !state.originalImage) return;
  canvas.toBlob((blob) => {
    if (!blob) {
      showError("The redacted image could not be created. Try redacting again.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const baseName = state.imageName.replace(/\.[^.]+$/, "") || "ghost-reader";
    anchor.href = url;
    anchor.download = `${baseName}-redacted.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    status.textContent = "Redacted PNG downloaded.";
  }, "image/png");
}

function loadFile(file) {
  clearError();
  const error = validateFile(file);
  if (error) {
    showError(error);
    return;
  }

  if (state.currentObjectUrl) URL.revokeObjectURL(state.currentObjectUrl);
  state.currentObjectUrl = URL.createObjectURL(file);
  state.imageName = file.name;
  state.ocrData = null;
  state.findings = [];
  state.selectedFindings = [];
  state.redactionApplied = false;
  downloadBtn.hidden = true;
  results.hidden = true;

  const image = new Image();
  image.onload = () => {
    state.originalImage = image;
    drawImage(image);
    scanBtn.disabled = false;
    status.textContent = `${file.name} loaded. Ready to scan.`;
  };
  image.onerror = () => {
    state.originalImage = null;
    scanBtn.disabled = true;
    showError("The image could not be decoded. Try opening it locally and saving it as PNG or JPG.");
    status.textContent = "Image load failed.";
  };
  image.src = state.currentObjectUrl;
}

async function scanImage() {
  if (!state.originalImage) return;
  clearError();
  scanBtn.disabled = true;
  progressWrap.hidden = false;
  results.hidden = true;
  state.redactionApplied = false;
  state.selectedFindings = [];
  setProgress(0, "Preparing OCR…");
  status.textContent = "Scanning locally with Tesseract.js…";

  let worker;
  try {
    worker = await Tesseract.createWorker("eng", 1, {
      logger: (message) => {
        if (typeof message.progress === "number") {
          const label = message.status ? message.status.replace(/_/g, " ") : "Processing OCR";
          setProgress(message.progress * 100, label);
        }
      }
    });

    const result = await worker.recognize(state.originalImage);
    state.ocrData = result.data;
    console.log("Ghost Reader OCR text:", result.data.text);
    console.log("Ghost Reader OCR word boxes:", result.data.words);

    setProgress(100, "OCR complete");
    window.dispatchEvent(new CustomEvent("ghostreader:ocr-complete", { detail: result.data }));
  } catch (error) {
    console.error("Ghost Reader OCR failure:", error);
    showError("OCR could not complete. Check your internet connection so Tesseract.js can load its worker and language data, then try again.");
    status.textContent = "OCR failed. No image data was uploaded by Ghost Reader.";
    progressWrap.hidden = true;
  } finally {
    if (worker) await worker.terminate();
    scanBtn.disabled = false;
  }
}

window.addEventListener("ghostreader:ocr-complete", (event) => {
  if (!window.GhostReaderDetectors) return;
  const detections = window.GhostReaderDetectors.detectSensitiveInfo(event.detail.text || "");
  state.findings = mapDetectionsToWordBoxes(event.detail, detections);
  renderResults();
  status.textContent = state.findings.length
    ? `${state.findings.length} potential leak${state.findings.length === 1 ? "" : "s"} detected. Review the findings below.`
    : "No leaks detected — but always double-check faces, names, and screenshots of private chats manually.";
  window.dispatchEvent(new CustomEvent("ghostreader:detections-complete", { detail: state.findings }));
});

chooseBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener("click", (event) => {
  if (event.target !== chooseBtn) fileInput.click();
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  loadFile(fileInput.files[0]);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  loadFile(file);
});

scanBtn.addEventListener("click", scanImage);
redactBtn.addEventListener("click", redactSelected);
downloadBtn.addEventListener("click", downloadCurrentCanvas);

window.addEventListener("resize", () => {
  if (!state.originalImage) return;
  if (state.redactionApplied) drawRedactions(state.selectedFindings);
  else drawImage(state.originalImage);
});
