/**
 * Encryption utilities using AES-GCM
 * Keys are generated and stored in URL hash for end-to-end encryption
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

/**
 * Generate a new 256-bit AES key
 */
export async function generateKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export key to base64url string for URL hash
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  const bytes = new Uint8Array(raw);
  return arrayBufferToBase64Url(bytes.buffer);
}

/**
 * Import key from base64url string
 */
export async function importKey(keyString: string): Promise<CryptoKey> {
  const raw = base64UrlToArrayBuffer(keyString);
  return await window.crypto.subtle.importKey(
    'raw',
    raw,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM
 */
export async function encrypt(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    data
  );
  
  return { encrypted, iv };
}

/**
 * Decrypt data with AES-GCM
 */
export async function decrypt(encrypted: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> {
  return await window.crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    encrypted
  );
}

/**
 * Generate encryption key for URL hash (v1 format)
 */
export async function generateEncryptionKeyForUrl(): Promise<{ key: CryptoKey; keyString: string }> {
  const key = await generateKey();
  const keyString = await exportKey(key);
  return { key, keyString: `v1.${keyString}` };
}

/**
 * Parse encryption key from URL hash
 */
export async function parseEncryptionKeyFromUrl(hash: string): Promise<CryptoKey | null> {
  if (!hash || hash.length < 3) return null;
  
  // Remove leading #
  const keyPart = hash.startsWith('#') ? hash.slice(1) : hash;
  
  // Check version prefix
  if (!keyPart.startsWith('v1.')) {
    console.error('Unsupported key version');
    return null;
  }
  
  const keyString = keyPart.slice(3); // Remove 'v1.'
  
  try {
    return await importKey(keyString);
  } catch (error) {
    console.error('Failed to import key:', error);
    return null;
  }
}

/**
 * Convert ArrayBuffer to base64url string
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64url string to ArrayBuffer
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Add padding if needed
  const padding = 4 - (base64url.length % 4);
  if (padding !== 4) {
    base64url += '='.repeat(padding);
  }
  
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}