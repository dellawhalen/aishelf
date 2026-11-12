import { NextResponse } from "next/server";
import { getAiUsageSummary, AiUsageStorageError } from "@/lib/ai-usage";
import { getWorkspaceUserAccess } from "@/lib/workspace-auth";

export async function GET() {
  const access = await getWorkspaceUserAccess();
  if (!access.authorized) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  try {
    const summary = await getAiUsageSummary(access.userId);
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AiUsageStorageError) {
      return NextResponse.json(
        { error: "AI usage controls are not initialized or available." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "AI usage could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
