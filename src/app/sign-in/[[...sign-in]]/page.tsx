import { signIn } from "@/auth";
import { Suspense } from "react";

type SignInPageProps = {
  searchParams: Promise<{ error?: string }>;
};

async function SignInNotice({ searchParams }: SignInPageProps) {
  const { error } = await searchParams;
  const message = error === "AccessDenied"
    ? "This GitHub account is not on the AIShelf invitation list."
    : error === "WorkspaceNotConfigured"
      ? "AIShelf access has not been configured yet."
      : null;

  return message ? <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">{message}</p> : null;
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">AIShelf</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Sign in to your workspace</h1>
        <p className="mt-2 text-sm text-slate-600">Access is invitation-only. Continue with the GitHub account approved for your group.</p>
        <Suspense fallback={null}>
          <SignInNotice searchParams={searchParams} />
        </Suspense>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
            Continue with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
