"""Load API keys from the gitignored api_keys.rtf at runtime.

Keys are NEVER hardcoded, printed, or committed. This parses the RTF the user
placed at repo root and exposes a dict + typed getters. Import and use; do not log values.
"""
from __future__ import annotations

import re
from pathlib import Path

_RTF = Path(__file__).resolve().parents[2] / "api_keys.rtf"  # <repo>/api_keys.rtf


def _strip_rtf(raw: str) -> str:
    s = re.sub(r"\\'[0-9a-fA-F]{2}", "", raw)          # hex escapes
    s = re.sub(r"\\[a-zA-Z]+-?[0-9]*", " ", s)          # control words
    s = s.replace("{", " ").replace("}", " ").replace("\\", " ")
    return s


def load_keys() -> dict[str, str]:
    """Return {normalized_name: value}. Names are lowercased, spaces→underscores."""
    if not _RTF.exists():
        raise FileNotFoundError(f"api_keys.rtf not found at {_RTF}")
    text = _strip_rtf(_RTF.read_text())
    keys: dict[str, str] = {}
    # "Name : value" or "NAME=value"; value is a single non-space token (API keys have no spaces).
    for m in re.finditer(r"([A-Za-z][A-Za-z0-9 _]*?)\s*[:=]\s*([^\s{}]+)", text):
        name = re.sub(r"\s+", "_", m.group(1).strip().lower())
        val = m.group(2).strip()
        if len(val) >= 6 and name not in keys:  # skip stray short tokens
            keys[name] = val
    return keys


def get(*candidates: str) -> str | None:
    """Return the first key whose normalized name contains any candidate substring."""
    keys = load_keys()
    for cand in candidates:
        for name, val in keys.items():
            if cand in name:
                return val
    return None


# Convenience accessors used by the adapters (resolved lazily, never printed).
def deepgram() -> str | None:
    return get("deepgram")


def livekit() -> dict[str, str | None]:
    return {"url": get("livekit_url"), "key": get("livekit_api_key"), "secret": get("livekit_api_secret")}


def vapi() -> dict[str, str | None]:
    return {"private": get("vapi_private"), "public": get("vapi_public")}


def cartesia() -> str | None:
    return get("cartesia")


def elevenlabs() -> str | None:
    return get("elevenlabs")


if __name__ == "__main__":
    # Diagnostic: print only WHICH keys were found, never the values.
    found = load_keys()
    print("Loaded key names (values hidden):")
    for n, v in found.items():
        print(f"  {n}: <{len(v)} chars>")
