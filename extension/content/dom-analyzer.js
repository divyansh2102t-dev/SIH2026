/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Content Script DOM Analyzer: Extracts Accessibility Tree & Local PII Bounding Rects
 */

(function () {
  const DOM_SENSITIVE_SELECTORS = {
    PASSWORD: {
      selector: 'input[type="password"]',
      name: 'Password Input',
      placeholder: '[PASSWORD_MASK]',
      redactionType: 'blackout',
      confidence: 0.99
    },
    EMAIL: {
      selector: 'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email" i]',
      name: 'Email Input Field',
      placeholder: '[PII_EMAIL_FIELD]',
      redactionType: 'blackout',
      confidence: 0.95
    },
    PHONE: {
      selector: 'input[type="tel"], input[name*="phone" i], input[name*="mobile" i], input[id*="phone" i], input[id*="mobile" i]',
      name: 'Phone Input Field',
      placeholder: '[PII_PHONE_FIELD]',
      redactionType: 'blackout',
      confidence: 0.94
    },
    CREDIT_CARD: {
      selector: 'input[name*="card" i], input[id*="card" i], input[autocomplete*="cc-" i], input[name*="cvv" i], input[id*="cvv" i]',
      name: 'Card / CVV Field',
      placeholder: '[PII_CARD_FIELD]',
      redactionType: 'blackout',
      confidence: 0.98
    },
    AADHAAR: {
      selector: 'input[name*="aadhaar" i], input[name*="aadhar" i], input[id*="aadhaar" i], input[id*="aadhar" i], input[name*="uid" i]',
      name: 'Aadhaar Input Field',
      placeholder: '[PII_AADHAAR_FIELD]',
      redactionType: 'blackout',
      confidence: 0.97
    },
    PAN: {
      selector: 'input[name*="pan" i], input[id*="pan" i]',
      name: 'PAN Input Field',
      placeholder: '[PII_PAN_FIELD]',
      redactionType: 'blackout',
      confidence: 0.95
    },
    AVATAR_OR_PHOTO: {
      selector: 'img[class*="avatar" i], img[class*="profile" i], img[id*="avatar" i], img[id*="profile" i], .avatar, .profile-pic',
      name: 'Profile / Avatar Image',
      placeholder: '[USER_AVATAR]',
      redactionType: 'blur',
      confidence: 0.92
    },
    ID_BADGE: {
      selector: '[class*="id-card" i], [class*="badge" i], [class*="document" i], img[src*="id" i]',
      name: 'ID Card / Document',
      placeholder: '[PII_GOVT_ID]',
      redactionType: 'pixelate',
      confidence: 0.90
    }
  };

  /**
   * Generates a stable unique CSS selector for an element
   */
  function generateUniqueSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    
    // Check for unique data attributes
    const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-id') || el.getAttribute('name');
    if (dataTestId) {
      const tag = el.tagName.toLowerCase();
      const attrName = el.hasAttribute('data-testid') ? 'data-testid' : (el.hasAttribute('data-id') ? 'data-id' : 'name');
      return `${tag}[${attrName}="${CSS.escape(dataTestId)}"]`;
    }

    // Path traversal
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => !c.startsWith('sih-') && c.length < 30);
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
        }
      }
      
      // Add nth-of-type if ambiguous
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
      if (path.length >= 4) break; // Keep selector concise
    }

    return path.join(' > ') || el.tagName.toLowerCase();
  }

  /**
   * Checks if an element is visible in the viewport
   */
  function isElementVisible(el, rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return false;
    }
    // Check if within visible viewport
    const vW = window.innerWidth || document.documentElement.clientWidth;
    const vH = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < vH && rect.bottom > 0 && rect.left < vW && rect.right > 0;
  }

  /**
   * Scan DOM for sensitive form inputs and elements
   */
  function detectDOMSensitiveElements() {
    const findings = [];

    for (const [category, item] of Object.entries(DOM_SENSITIVE_SELECTORS)) {
      try {
        const elements = document.querySelectorAll(item.selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (isElementVisible(el, rect)) {
            findings.push({
              source: 'DOM_SELECTOR',
              category: category,
              name: item.name,
              placeholder: item.placeholder,
              redactionType: item.redactionType,
              confidence: item.confidence,
              selector: generateUniqueSelector(el),
              bounds: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              }
            });
          }
        });
      } catch (err) {
        console.warn('[SIH DOM Analyzer] Selector error:', item.selector, err);
      }
    }

    return findings;
  }

  /**
   * Scan text nodes for PII patterns using Regex and get physical screen bounds
   */
  function detectTextNodePII() {
    if (typeof scanTextForPII !== 'function') return [];
    const findings = [];

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue || node.nodeValue.trim().length < 4) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      const matches = scanTextForPII(text);
      if (matches.length > 0) {
        const parent = node.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : null;
        if (parent && parentRect && isElementVisible(parent, parentRect)) {
          matches.forEach(match => {
            // Attempt precise range bounding rect
            let bounds = {
              x: Math.round(parentRect.left),
              y: Math.round(parentRect.top),
              w: Math.round(parentRect.width),
              h: Math.round(parentRect.height)
            };

            try {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match.length);
              const rangeRect = range.getBoundingClientRect();
              if (rangeRect.width > 0 && rangeRect.height > 0) {
                bounds = {
                  x: Math.round(rangeRect.left),
                  y: Math.round(rangeRect.top),
                  w: Math.round(rangeRect.width),
                  h: Math.round(rangeRect.height)
                };
              }
            } catch (e) {
              // fallback to parent bounds
            }

            findings.push({
              source: 'TEXT_REGEX',
              category: match.type,
              name: match.name,
              placeholder: match.placeholder,
              redactionType: match.redactionType,
              confidence: match.confidence,
              selector: generateUniqueSelector(parent),
              bounds: bounds
            });
          });
        }
      }
    }

    return findings;
  }

  /**
   * Extracts accessibility tree (Interactive elements & structural layout)
   */
  function extractAccessibilityTree() {
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details'];
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem', 'tab', 'switch'];
    
    const elements = document.querySelectorAll('*');
    const tree = [];

    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const isInteractive = interactiveTags.includes(tag) || 
                            interactiveRoles.includes(role) || 
                            el.hasAttribute('onclick') || 
                            el.getAttribute('tabindex') === '0' ||
                            window.getComputedStyle(el).cursor === 'pointer';

      if (isInteractive) {
        const rect = el.getBoundingClientRect();
        if (isElementVisible(el, rect)) {
          // Extract text label while scrubbing sensitive values
          let rawText = (el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
          
          // Scrub potential PII from the accessibility tree text
          if (el.type === 'password') {
            rawText = '[PASSWORD_FIELD]';
          } else if (typeof scanTextForPII === 'function') {
            const matches = scanTextForPII(rawText);
            matches.forEach(m => {
              rawText = rawText.replace(m.value, m.placeholder);
            });
          }

          tree.push({
            tag: tag,
            role: role || tag,
            text: rawText.substring(0, 60),
            placeholder: el.getAttribute('placeholder') || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            id: el.id || null,
            type: el.getAttribute('type') || null,
            disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            selector: generateUniqueSelector(el),
            bounds: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              w: Math.round(rect.width),
              h: Math.round(rect.height)
            }
          });
        }
      }
    });

    return tree.slice(0, 75); // Cap to 75 most relevant elements to optimize token size
  }

  // Global API on window for Content Bridge
  window.SIH_DOM_ANALYZER = {
    getDOMElementsPII: detectDOMSensitiveElements,
    getTextNodePII: detectTextNodePII,
    getAccessibilityTree: extractAccessibilityTree,
    getViewport: () => ({
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight,
      scrollX: window.scrollX || window.pageXOffset,
      scrollY: window.scrollY || window.pageYOffset,
      devicePixelRatio: window.devicePixelRatio || 1
    })
  };
})();
