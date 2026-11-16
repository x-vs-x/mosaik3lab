import bcrypt from 'bcryptjs';

const COST = 12;

// Wird verglichen, wenn ein Benutzer nicht existiert, damit die Antwortzeit
// nicht verrät, ob ein Benutzername vergeben ist.
const DUMMY_HASH = bcrypt.hashSync('mosaik3lab-dummy-password', COST);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? DUMMY_HASH);
}
