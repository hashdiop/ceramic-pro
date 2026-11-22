import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pwd: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 64;

/** Hachage scrypt salé (module crypto de Node, aucune dépendance) : "scrypt$<sel>$<hash>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Règle minimale pour un nouveau mot de passe. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  return null;
}
