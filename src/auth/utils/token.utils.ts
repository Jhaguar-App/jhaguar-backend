import { randomBytes } from 'crypto';

export function generateSecureToken(): string {
  return randomBytes(64).toString('hex');
}

export function generateJti(): string {
  return randomBytes(16).toString('hex');
}
