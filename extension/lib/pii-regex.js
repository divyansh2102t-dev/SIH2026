/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * High-Precision Indian Context PII Regular Expression Engine
 */

const PII_PATTERNS = {
  AADHAAR: {
    // 12 digits, optional spaces/hyphens (e.g., 2345 6789 0123)
    regex: /\b[2-9]\d{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
    label: '[PII_AADHAAR]',
    name: 'Aadhaar Number',
    redactionType: 'blackout',
    confidence: 0.96
  },
  PAN: {
    // 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    label: '[PII_PAN]',
    name: 'PAN Card Number',
    redactionType: 'blackout',
    confidence: 0.98
  },
  INDIAN_PHONE: {
    // Optional +91 / 0, followed by 10 digits starting with 6-9
    regex: /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g,
    label: '[PII_PHONE]',
    name: 'Indian Mobile Number',
    redactionType: 'blackout',
    confidence: 0.94
  },
  EMAIL: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    label: '[PII_EMAIL]',
    name: 'Email Address',
    redactionType: 'blackout',
    confidence: 0.99
  },
  CREDIT_CARD: {
    // 16 digits formatted in groups of 4
    regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
    label: '[PII_CARD]',
    name: 'Credit/Debit Card',
    redactionType: 'blackout',
    confidence: 0.95
  },
  IFSC_CODE: {
    // 4 letters, 0, 6 alphanumeric (e.g. SBIN0001234)
    regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    label: '[PII_IFSC]',
    name: 'Bank IFSC Code',
    redactionType: 'blackout',
    confidence: 0.95
  },
  PASSPORT_IN: {
    // 1 letter followed by 7 digits
    regex: /\b[A-Z][0-9]{7}\b/g,
    label: '[PII_PASSPORT]',
    name: 'Passport Number',
    redactionType: 'blackout',
    confidence: 0.92
  }
};

/**
 * Scan a text string for all known PII entities.
 * @param {string} text 
 * @returns {Array<{type: string, name: string, value: string, placeholder: string, redactionType: string, confidence: number}>}
 */
function scanTextForPII(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];

  for (const [key, pattern] of Object.entries(PII_PATTERNS)) {
    pattern.regex.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        type: key,
        name: pattern.name,
        value: match[0],
        index: match.index,
        length: match[0].length,
        placeholder: pattern.label,
        redactionType: pattern.redactionType,
        confidence: pattern.confidence
      });
    }
  }

  return matches;
}

// Export for ES Module / Browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PII_PATTERNS, scanTextForPII };
}
