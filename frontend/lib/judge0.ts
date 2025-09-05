// Fetch supported languages from backend API
export async function fetchJudge0Languages() {
  const res = await fetch("/api/languages?active=true");
  if (!res.ok) throw new Error("Failed to fetch languages from backend");
  const data = await res.json();
  return data.languages;
}
