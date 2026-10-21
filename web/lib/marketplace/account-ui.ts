/**
 * Pure helpers for Account settings UI (Chunk 42).
 * Keep free of Node-only imports (account.ts pulls disconnect/secrets).
 */

import type { UserRole } from "./enums";

/** Required confirmation text for close — must match operator trading_name. */
export function closeConfirmTextForOperator(tradingName: string): string {
  return tradingName.trim();
}

export function isCloseConfirmValid(
  tradingName: string,
  confirmText: unknown
): boolean {
  if (typeof confirmText !== "string") return false;
  return confirmText.trim() === closeConfirmTextForOperator(tradingName);
}

export function canManageAccount(
  role: string | null | undefined
): boolean {
  return role === "owner";
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? []) {
    out[e.field] = e.message;
  }
  return out;
}

export function ownerOnlyHint(role: UserRole | null): string | null {
  if (!role) return null;
  if (role === "owner") return null;
  return "Only the account owner can export data or close the account.";
}

export function closeWarningCopy(tradingName: string): string {
  return `This will end all live and scheduled deals, disconnect integrations, and suspend ${tradingName}. Type the trading name to confirm.`;
}
