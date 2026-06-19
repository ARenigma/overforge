import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./_components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Plus, User } from "lucide-react";

interface Interview {
  id: string;
  candidate_email: string | null;
  status: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "border-[#2A2E37] text-[#9AA1AC] bg-transparent",
  active: "border-[#2F6BFF]/40 text-[#2F6BFF] bg-[#2F6BFF]/10",
  completed: "border-[#34D399]/40 text-[#34D399] bg-[#34D399]/10",
  cancelled: "border-[#F2555A]/40 text-[#F2555A] bg-[#F2555A]/10",
};

function statusStyle(status: string) {
  return (
    STATUS_STYLES[status.toLowerCase()] ??
    "border-[#2A2E37] text-[#9AA1AC] bg-transparent"
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, candidate_email, status, created_at")
    .order("created_at", { ascending: false });

  const rows = (interviews ?? []) as Interview[];

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-[#EAECEF]">
      {/* Header */}
      <header className="border-b border-[#2A2E37] bg-[#141619]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-medium text-[#EAECEF]">Over</span>
            <span className="text-base font-bold text-[#2F6BFF] -ml-2">Forge</span>

            <span className="text-[#2A2E37] mx-1">·</span>

            <div className="flex items-center gap-1.5 text-sm text-[#9AA1AC]">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[220px]">{user.email}</span>
            </div>
          </div>

          <SignOutButton />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Section heading */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-[#EAECEF]">Your interviews</h1>
            <p className="text-sm text-[#9AA1AC] mt-0.5">
              All sessions where you are the interviewer
            </p>
          </div>

          {/* Placeholder — create flow comes in a later milestone */}
          <Button
            disabled
            className="h-9 bg-[#2F6BFF] hover:bg-[#2F6BFF]/90 text-white text-sm gap-2 disabled:opacity-40 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            New interview
          </Button>
        </div>

        {/* Interview list */}
        {rows.length === 0 ? (
          <div className="border border-dashed border-[#2A2E37] rounded-xl py-16 flex flex-col items-center gap-3 text-center">
            <CalendarClock className="w-8 h-8 text-[#2A2E37]" />
            <p className="text-sm font-medium text-[#9AA1AC]">No interviews yet</p>
            <p className="text-xs text-[#9AA1AC]/60 max-w-xs">
              When you create interview sessions they will appear here.
            </p>
          </div>
        ) : (
          <div className="border border-[#2A2E37] rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_160px_120px] gap-4 px-5 py-3 bg-[#1C1F25] border-b border-[#2A2E37]">
              <span className="text-[10px] uppercase tracking-widest text-[#9AA1AC] font-medium">
                Candidate
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#9AA1AC] font-medium">
                Created
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#9AA1AC] font-medium">
                Status
              </span>
            </div>

            {/* Rows */}
            <ul>
              {rows.map((interview, idx) => (
                <li
                  key={interview.id}
                  className={[
                    "grid grid-cols-[1fr_160px_120px] gap-4 px-5 py-3.5 items-center",
                    idx < rows.length - 1 ? "border-b border-[#2A2E37]" : "",
                    "hover:bg-[#1C1F25]/60 transition-colors",
                  ].join(" ")}
                >
                  <span className="text-sm text-[#EAECEF] truncate">
                    {interview.candidate_email ?? (
                      <span className="text-[#9AA1AC] italic">No candidate yet</span>
                    )}
                  </span>
                  <span className="text-sm text-[#9AA1AC]">
                    {formatDate(interview.created_at)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs w-fit capitalize ${statusStyle(interview.status)}`}
                  >
                    {interview.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
