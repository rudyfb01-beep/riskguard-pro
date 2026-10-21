/**
 * Utility for Immutable Chained Audit Trail Ledger
 * Calculates simulated or Web Crypto SHA-256 block hashes
 */
export async function computeBlockHash(
  blockNumber: number,
  timestamp: string,
  user: string,
  action: string,
  entityCode: string,
  details: string,
  previousHash: string
): Promise<string> {
  const payload = `${blockNumber}|${timestamp}|${user}|${action}|${entityCode}|${details}|${previousHash}`;
  
  // Try Web Crypto API if available
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback
    }
  }

  // Pure deterministic JS fallback hash (64 hex characters)
  let h1 = 0xdeadbeef ^ blockNumber;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hexPart1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hexPart2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hexPart3 = ((h1 ^ 0xa5a5a5a5) >>> 0).toString(16).padStart(8, '0');
  const hexPart4 = ((h2 ^ 0x5a5a5a5a) >>> 0).toString(16).padStart(8, '0');
  const hexPart5 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  const hexPart6 = ((h1 * 31) >>> 0).toString(16).padStart(8, '0');
  const hexPart7 = ((h2 * 17) >>> 0).toString(16).padStart(8, '0');
  const hexPart8 = ((blockNumber * 99991) >>> 0).toString(16).padStart(8, '0');

  return `${hexPart1}${hexPart2}${hexPart3}${hexPart4}${hexPart5}${hexPart6}${hexPart7}${hexPart8}`.slice(0, 64);
}
