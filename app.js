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

let originalImage = null;
let currentObjectUrl = null;

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

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  const image = new Image();
  image.onload = () => {
    originalImage = image;
    drawImage(image);
    scanBtn.disabled = false;
    status.textContent = `${file.name} loaded. Ready to scan.`;
  };
  image.onerror = () => {
    originalImage = null;
    scanBtn.disabled = true;
    showError("The image could not be decoded. Try opening it locally and saving it as PNG or JPG.");
    status.textContent = "Image load failed.";
  };
  image.src = currentObjectUrl;
}

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

window.addEventListener("resize", () => {
  if (originalImage) drawImage(originalImage);
});
