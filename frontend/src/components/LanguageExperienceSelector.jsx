import { useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useLanguages } from "../context/LanguageContext";

export default function LanguageExperienceSelector({ onSelect }) {
  const { languages } = useLanguages();
  const [language, setLanguage] = useState("");
  const [experience, setExperience] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!language || !experience) {
      setError("Please select a language and enter your experience.");
      return;
    }
    setError("");
    onSelect({ language, experience: parseInt(experience, 10) });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="p-8 w-full max-w-md space-y-6">
        <h2 className="text-xl font-semibold mb-4 text-center">Select Language & Experience</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">Coding Language</label>
            <select
              className="w-full border rounded px-2 py-2"
              value={language}
              onChange={e => setLanguage(e.target.value)}
              required
            >
              <option value="">Select a language</option>
              {languages.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-medium">Experience (years)</label>
            <Input
              type="number"
              min="0"
              max="50"
              step="1"
              value={experience}
              onChange={e => setExperience(e.target.value)}
              placeholder="e.g. 2"
              required
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
} 