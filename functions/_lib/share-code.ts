/**
 * Share-code generation. 8-char Crockford base32 (no I, L, O, U) so codes
 * are unambiguous when typed or read aloud. ~10^12 codespace; collisions
 * effectively impossible at our scale, but the DB has UNIQUE on the column
 * so any genuine collision surfaces as an error and the caller retries.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 chars, Crockford-style

export function generateShareCode(): string {
  // 5 random bytes = 40 bits; encode 8 base-32 chars.
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

/**
 * Insert a share_code on a row, retrying on UNIQUE collision. Returns the
 * code that was actually written.
 *
 * The retry loop is defensive: with 10^12 codespace we effectively never
 * hit it, but it's the right pattern when an externally-shareable id is
 * UNIQUE-constrained.
 */
export async function assignShareCode(
  db: D1Database,
  tokenId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShareCode();
    try {
      const res = await db
        .prepare(
          "UPDATE responses SET share_code = ? WHERE token_id = ? AND share_code IS NULL",
        )
        .bind(code, tokenId)
        .run();
      if ((res.meta?.changes ?? 0) > 0) return code;

      // No rows updated: code already set; fetch and return.
      const existing = await db
        .prepare("SELECT share_code FROM responses WHERE token_id = ?")
        .bind(tokenId)
        .first<{ share_code: string | null }>();
      if (existing?.share_code) return existing.share_code;
      // Shouldn't reach here unless the row was deleted between the UPDATE
      // and the SELECT. Fall through to retry.
    } catch (err) {
      // UNIQUE constraint collision — try a new code.
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new Error("Could not assign share_code after 5 attempts");
}
