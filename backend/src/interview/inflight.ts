// Per-interview in-flight registry for code runs and answer submissions.
//
// Used by the engagement engine's Path C gate: it must never fire an intervention
// while a run is executing (§6.3 — quiescence crossing threshold during a run is not
// real quiescence). Single-process invariant — same discipline as lock.ts.

const runsInFlight = new Set<string>();
const answersInFlight = new Set<string>();

export function markRunInFlight(interviewId: string): void {
  runsInFlight.add(interviewId);
}
export function clearRunInFlight(interviewId: string): void {
  runsInFlight.delete(interviewId);
}
export function isRunInFlight(interviewId: string): boolean {
  return runsInFlight.has(interviewId);
}

export function markAnswerInFlight(interviewId: string): void {
  answersInFlight.add(interviewId);
}
export function clearAnswerInFlight(interviewId: string): void {
  answersInFlight.delete(interviewId);
}
export function isAnswerInFlight(interviewId: string): boolean {
  return answersInFlight.has(interviewId);
}
