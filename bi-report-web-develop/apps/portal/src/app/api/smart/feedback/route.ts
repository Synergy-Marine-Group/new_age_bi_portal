import { NextRequest, NextResponse } from "next/server";
import { emailFromBearer } from "@/lib/catalog/entra-user";
import {
  isOrchestratorConfigured,
  signOrchestratorToken,
  smartFetch,
} from "@/lib/server/smart-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set(["wrong_report", "wrong_number", "missing_data", "slow", "unclear", "other"]);

interface FeedbackBody {
  requestId?: unknown;
  rating?: unknown;
  reason?: unknown;
  comment?: unknown;
}

function json(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isOrchestratorConfigured()) return json("Feedback is unavailable", 503);

  let email: string | null = null;
  try {
    email = await emailFromBearer(request.headers.get("authorization"));
  } catch {
    email = null;
  }
  if (!email) return json("Sign in required", 401);

  const body = (await request.json().catch(() => ({}))) as FeedbackBody;
  const requestId = typeof body.requestId === "string" && /^[\w-]{8,64}$/.test(body.requestId) ? body.requestId : null;
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  const reason = typeof body.reason === "string" && REASONS.has(body.reason) ? body.reason : null;
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : "";
  if (!requestId || !rating) return json("Invalid feedback", 400);

  const token = await signOrchestratorToken(email);
  if (!token) return json("Feedback is unavailable", 503);

  try {
    const upstream = await smartFetch("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      bearerToken: token,
      body: JSON.stringify({ request_id: requestId, rating, reason, comment: comment || null }),
      signal: AbortSignal.timeout(10_000),
    });
    if (upstream.ok) return NextResponse.json({ status: "ok" });
    if (upstream.status === 404) return json("That answer can no longer be rated", 404);
    if (upstream.status === 429) return json("Too many requests, please wait a moment", 429);
    return json("Feedback could not be saved", 502);
  } catch {
    return json("Feedback could not be saved", 502);
  }
}