import { auth } from "@/auth";
import {
  isDevelopmentAuthBypassEnabled,
  isWorkspaceUserAllowed,
} from "@/lib/workspace-authorization";

export type WorkspaceUserAccess =
  | { authorized: true; userId: string }
  | { authorized: false; status: 401 | 403 | 503; message: string };

export async function getWorkspaceUserAccess(): Promise<WorkspaceUserAccess> {
  if (isDevelopmentAuthBypassEnabled(process.env.NODE_ENV, process.env.AISHELF_TEST_AUTH_BYPASS)) {
    return { authorized: true, userId: "functional-test-user" };
  }

  const allowedUserIds = process.env.AISHELF_ALLOWED_USER_IDS;
  if (!allowedUserIds?.trim()) {
    return { authorized: false, status: 503, message: "AIShelf workspace access is not configured." };
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return { authorized: false, status: 401, message: "Sign in to access AIShelf." };
  }

  if (!isWorkspaceUserAllowed(userId, allowedUserIds)) {
    return { authorized: false, status: 403, message: "This account is not authorized to access this AIShelf workspace." };
  }

  return { authorized: true, userId };
}
