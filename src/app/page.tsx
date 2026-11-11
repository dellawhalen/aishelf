import { redirect } from "next/navigation";
import { Suspense } from "react";
import Dashboard from "@/components/dashboard";
import { getWorkspaceUserAccess } from "@/lib/workspace-auth";

async function AuthorizedHome() {
  const access = await getWorkspaceUserAccess();
  if (!access.authorized) {
    if (access.status === 401) redirect("/sign-in");
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">AIShelf workspace unavailable</h1>
        <p>{access.message}</p>
      </main>
    );
  }
  return <Dashboard />;
}

export default function Home() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Loading AIShelf…</main>}>
      <AuthorizedHome />
    </Suspense>
  );
}
