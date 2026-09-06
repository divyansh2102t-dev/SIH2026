/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Zero-Trust Local Vault Encryption Engine: AES-GCM 256-bit + PBKDF2 (100k rounds)
 * Ensures personal credentials stored in chrome.storage.local are fully encrypted on-device.
 */

(function (global) {
  const DEFAULT_SALT = 'ISRO_SIH2026_ZERO_TRUST_SALT_9812';
  const DEFAULT_PASSPHRASE = 'ISRO_LOCAL_DEVICE_MASTER_VAULT_KEY_26171';

  /**
   * Converts ArrayBuffer to Base64 String
   */
  function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Converts Base64 String to Uint8Array
   */
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Derives an AES-GCM 256-bit key from passphrase and salt using PBKDF2
   */
  async function deriveKey(passphrase, saltBuffer) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase || DEFAULT_PASSPHRASE),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts plain object to encrypted envelope with AES-GCM 256-bit
   */
  async function encryptVault(plainData, passphrase = DEFAULT_PASSPHRASE) {
    try {
      const enc = new TextEncoder();
      const encodedPlaintext = enc.encode(JSON.stringify(plainData));

      // Generate 16-byte random salt and 12-byte IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const key = await deriveKey(passphrase, salt);

      const cipherBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedPlaintext
      );

      return {
        isEncrypted: true,
        cipherText: bufferToBase64(cipherBuffer),
        iv: bufferToBase64(iv),
        salt: bufferToBase64(salt),
        algorithm: 'AES-GCM-256',
        updatedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('[Vault Crypto] Encryption error:', err);
      throw err;
    }
  }

  /**
   * Decrypts encrypted envelope back to plaintext object
   */
  async function decryptVault(encryptedRecord, passphrase = DEFAULT_PASSPHRASE) {
    if (!encryptedRecord) return {};

    // Backward compatibility: If data was saved unencrypted, return directly
    if (!encryptedRecord.isEncrypted && typeof encryptedRecord === 'object' && (encryptedRecord.fullName || encryptedRecord.email)) {
      return encryptedRecord;
    }

    try {
      const saltBuffer = base64ToBuffer(encryptedRecord.salt);
      const ivBuffer = base64ToBuffer(encryptedRecord.iv);
      const cipherBuffer = base64ToBuffer(encryptedRecord.cipherText);

      const key = await deriveKey(passphrase, saltBuffer);

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer
        },
        key,
        cipherBuffer
      );

      const dec = new TextDecoder();
      const jsonStr = dec.decode(decryptedBuffer);
      return JSON.parse(jsonStr);
    } catch (err) {
      console.error('[Vault Crypto] Decryption error:', err);
      return {};
    }
  }

  /**
   * Storage helpers: Save encrypted vault to chrome.storage.local
   */
  async function saveEncryptedVault(plainVault, passphrase = DEFAULT_PASSPHRASE) {
    const encryptedRecord = await encryptVault(plainVault, passphrase);
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ userVaultEncrypted: encryptedRecord }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(encryptedRecord);
      });
    });
  }

  /**
   * Storage helpers: Load and decrypt vault from chrome.storage.local
   */
  async function loadDecryptedVault(passphrase = DEFAULT_PASSPHRASE) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['userVaultEncrypted', 'userVault'], async (res) => {
        if (res.userVaultEncrypted) {
          const decrypted = await decryptVault(res.userVaultEncrypted, passphrase);
          resolve(decrypted);
        } else if (res.userVault) {
          // Auto-migrate legacy plaintext vault into AES-GCM encrypted vault
          const legacyVault = res.userVault;
          await saveEncryptedVault(legacyVault, passphrase);
          chrome.storage.local.remove(['userVault']);
          resolve(legacyVault);
        } else {
          // Default initial demo vault (auto-encrypted on first load)
          const defaultVault = {
            fullName: 'Aditya Sharma',
            email: 'aditya.sharma@isro.gov.in',
            phone: '9876543210',
            aadhaar: '2345 6789 0123',
            pan: 'ABCDE1234F',
            abhaId: '12-3456-7890-1234',
            bankAccount: '123456789012',
            ifsc: 'HDFC0001234',
            upiId: 'aditya@okhdfcbank',
            securityClearance: 'ISRO-SC-8891'
          };
          await saveEncryptedVault(defaultVault, passphrase);
          resolve(defaultVault);
        }
      });
    });
  }

  // Export to global scope
  const VaultCrypto = {
    encryptVault,
    decryptVault,
    saveEncryptedVault,
    loadDecryptedVault
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VaultCrypto;
  } else {
    global.VaultCrypto = VaultCrypto;
  }
})(typeof self !== 'undefined' ? self : this);