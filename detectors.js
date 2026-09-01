// Detector configuration is intentionally kept in one place so each pattern can be reviewed independently.
const DETECTOR_CONFIG = {
  email: { label: "Email", regex: /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g },
  phone: {
    label: "Phone",
    regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g
  },
  apiKey: {
    label: "API key / secret",
    prefixRegex: /(?:sk-|ghp_|AIza|AKIA)[A-Za-z0-9_-]{12,}/g,
    genericRegex: /\b[A-Za-z0-9]{20,}\b/g
  },
  ipv4: { label: "IPv4 address", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  creditCard: { label: "Credit card", regex: /(?:\d[ -]?){13,19}/g },
  crypto: {
    label: "Crypto wallet",
    bitcoinRegex: /(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})/g,
    ethereumRegex: /\b0x[a-fA-F0-9]{40}\b/g
  }
};

function makeFinding(type, match, index) {
  return { type, label: DETECTOR_CONFIG[type].label, text: match, start: index, end: index + match.length };
}

function detectEmails(text) {
  return collectMatches(text, DETECTOR_CONFIG.email.regex, "email");
}

function normalizePhoneDigits(value) {
  return value.replace(/\D/g, "");
}

function detectPhones(text) {
  const findings = [];
  const regex = new RegExp(DETECTOR_CONFIG.phone.regex.source, "g");
  let match;
  while ((match = regex.exec(text))) {
    const digits = normalizePhoneDigits(match[0]);
    const startsLikeNumber = /^[+()\d]/.test(match[0]);
    if (startsLikeNumber && digits.length >= 10 && digits.length <= 15) {
      findings.push(makeFinding("phone", match[0], match.index));
    }
  }
  return findings;
}

function detectApiKeys(text) {
  const findings = [
    ...collectMatches(text, DETECTOR_CONFIG.apiKey.prefixRegex, "apiKey")
  ];
  const generic = collectMatches(text, DETECTOR_CONFIG.apiKey.genericRegex, "apiKey").filter((finding) => {
    const value = finding.text;
    return /[A-Za-z]/.test(value) && /\d/.test(value);
  });
  return dedupeFindings([...findings, ...generic]);
}

function isValidIpv4(value) {
  return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function detectIpv4(text) {
  return collectMatches(text, DETECTOR_CONFIG.ipv4.regex, "ipv4").filter((finding) => isValidIpv4(finding.text));
}

function luhnCheck(value) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function detectCreditCards(text) {
  return collectMatches(text, DETECTOR_CONFIG.creditCard.regex, "creditCard").filter((finding) => {
    const digits = finding.text.replace(/[ -]/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
  });
}

function detectCryptoWallets(text) {
  return [
    ...collectMatches(text, DETECTOR_CONFIG.crypto.bitcoinRegex, "crypto"),
    ...collectMatches(text, DETECTOR_CONFIG.crypto.ethereumRegex, "crypto")
  ];
}

function collectMatches(text, regex, type) {
  const findings = [];
  const matcher = new RegExp(regex.source, "g");
  let match;
  while ((match = matcher.exec(text))) {
    findings.push(makeFinding(type, match[0], match.index));
    if (match[0] === "") matcher.lastIndex += 1;
  }
  return findings;
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.type}:${finding.start}:${finding.end}:${finding.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectSensitiveInfo(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  return dedupeFindings([
    ...detectEmails(text),
    ...detectPhones(text),
    ...detectApiKeys(text),
    ...detectIpv4(text),
    ...detectCreditCards(text),
    ...detectCryptoWallets(text)
  ]).sort((a, b) => a.start - b.start || a.end - b.end);
}

function runDetectorSelfTest() {
  const sample = [
    "Email test@example.com",
    "Phone +91 98765 43210",
    "Secret sk-abcd1234efgh5678ijkl",
    "IP 192.168.1.42",
    "Card 4539 1488 0343 6467",
    "BTC 1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    "ETH 0x52908400098527886E0F7030069857D2E4169EE7"
  ].join(" | ");
  const findings = detectSensitiveInfo(sample);
  const expected = ["email", "phone", "apiKey", "ipv4", "creditCard", "crypto"];
  const passed = expected.every((type) => findings.some((finding) => finding.type === type));
  console.assert(passed, "Ghost Reader detector self-test failed", findings);
  return passed;
}

window.GhostReaderDetectors = {
  DETECTOR_CONFIG,
  detectSensitiveInfo,
  runDetectorSelfTest
};

runDetectorSelfTest();
