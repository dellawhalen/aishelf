export function isDevelopmentAuthBypassEnabled(nodeEnvironment: string | undefined, bypassValue: string | undefined) {
  return nodeEnvironment === "development" && bypassValue === "1";
}

export function isWorkspaceUserAllowed(userId: string | null, allowedUserIds: string | undefined) {
  if (!userId || !allowedUserIds?.trim()) return false;
  return allowedUserIds.split(",").some((allowedId) => allowedId.trim() === userId);
}

export function isAllowedGithubAccount(
  provider: string | null | undefined,
  accountId: string | null | undefined,
  allowedUserIds: string | undefined,
) {
  return provider === "github"
    && Boolean(accountId && /^\d+$/.test(accountId))
    && isWorkspaceUserAllowed(accountId ?? null, allowedUserIds);
}
