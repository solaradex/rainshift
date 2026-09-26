import crypto from "node:crypto";

function getKey() {
  const value = process.env.SCHEDULING_TOKEN_ENCRYPTION_KEY;

  if (value && /^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  // Production fallback: Jobber OAuth already requires JOBBER_CLIENT_SECRET.
  // Derive a separate AES-256 key from it so an omitted optional encryption
  // variable does not block the OAuth connection.
  const jobberSecret = process.env.JOBBER_CLIENT_SECRET;
  if (jobberSecret) {
    return crypto
      .createHash("sha256")
      .update("rainshift-scheduling-token-v1:")
      .update(jobberSecret)
      .digest();
  }

  throw new Error(
    "Token encryption is not configured: set SCHEDULING_TOKEN_ENCRYPTION_KEY to 64 hex characters"
  );
}

export function encryptToken(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptToken(payload: string) {
  const [ivText, tagText, encryptedText] = payload.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted token");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
