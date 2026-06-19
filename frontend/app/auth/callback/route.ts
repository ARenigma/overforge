import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validate the `next` param to prevent open redirects — only allow
  // relative paths that start with a single slash.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(error.message)}`,
    );
  }

  // No code present — something went wrong upstream.
  return NextResponse.redirect(`${origin}/auth?error=missing_code`);
}
