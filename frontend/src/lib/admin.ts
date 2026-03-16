export const ADMIN_EMAILS = [
  "aniketar111@gmail.com",
  "anthoraiofficial@gmail.com",
];

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}
