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

const state = window.ghostReader = window.ghostReader || {
  originalImage: null,
  currentObjectUrl: null,
  ocrData: null,
  findings: [],
  imageName: ""
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
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Unsupported image type. Use PNG, JPG, JPEG, or WebP.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Image is too large. Please choose a file up to 15 MB.";
  }
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

function setProgress(value, label) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  progress.value = percent;
  progressPercent.textContent = `${percent}%`;
  progressText.textContent = label;
}

async function scanImage() {
  if (!state.originalImage) return;

  clearError();
  scanBtn.disabled = true;
  progressWrap.hidden = false;
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
    status.textContent = "OCR complete. Checking for sensitive information…";
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
  state.findings = window.GhostReaderDetectors.detectSensitiveInfo(event.detail.text || "");
  status.textContent = `${state.findings.length} potential leak${state.findings.length === 1 ? "" : "s"} detected. Review the findings below.`;
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

window.addEventListener("resize", () => {
  if (state.originalImage) drawImage(state.originalImage);
});
