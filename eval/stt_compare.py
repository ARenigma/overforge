"""Multi-clip STT bake-off: AssemblyAI vs Soniox vs Groq-whisper baseline.

Keys are read from api_keys.rtf at runtime (never hardcoded). Ground truth for the
lecture clips is MIT/Stanford's own human captions (aligned per-window); test_sample
uses the read jargon script. WER via jiwer; substitution errors are auto-extracted so
jargon mangles surface without a hand-picked term list.

Run:  uv run --with jiwer --with requests python eval/stt_compare.py
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import re
import time
from pathlib import Path

import jiwer
import requests

ROOT = Path(__file__).resolve().parent
SAMPLES = ROOT / "samples"
RTF = ROOT.parent / "api_keys.rtf"

AAI_MODEL = "universal-3-pro"
SONIOX_MODEL = "stt-async-v5"          # latest async; falls back to preview on 4xx
GROQ_MODEL = "whisper-large-v3"

TEST_SAMPLE_GT = (
    "Sure, let me walk you through the most complex system I've built. It was a "
    "real-time analytics pipeline for a multi-tenant platform. We ingested "
    "clickstream events through Kafka, and orchestrated the downstream "
    "transformations with Airflow. Every DAG was designed to be idempotent, so "
    "that a retried task could never double-count a record. Okay, so the hardest "
    "part was concurrency. Multiple workers were updating the same aggregate, so "
    "at first I guarded the critical section with a mutex, but that caused "
    "contention, so I switched to an optimistic-locking scheme with a version "
    "column. For storage, PostgreSQL was our source of truth, and we put Redis in "
    "front as a write-through cache. Consistency was the real question: because we "
    "replicated across three regions, we couldn't guarantee linearizability "
    "without destroying latency. So we accepted eventual consistency, and used a "
    "CRDT, a conflict-free replicated data type, for the counters. To survive load "
    "spikes, we applied backpressure at the ingestion layer, and sharded the Kafka "
    "topics by tenant. The microservices communicated over gRPC, authenticated "
    "with short-lived JWTs, and we memoized the expensive dimension lookups. If I "
    "were redesigning it today, I'd move to a quorum-based write path, and lean on "
    "Kubernetes for autoscaling the consumers. That's the high-level overview, "
    "happy to go deeper on any piece."
)


def clean_gt(s: str) -> str:
    """Strip SRT speaker labels (AUDIENCE:/PROFESSOR:) — not spoken words."""
    s = re.sub(r"\b(?:AUDIENCE|PROFESSOR|STUDENT|SPEAKER|GUEST|INTERVIEWER)\b:?", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load_keys() -> dict[str, str]:
    """Extract API keys from the RTF by label, without printing them."""
    raw = RTF.read_text(errors="ignore")
    # strip rtf control words + braces -> rough plaintext
    txt = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", raw)
    txt = txt.replace("{", " ").replace("}", " ").replace("\\", " ")
    keys: dict[str, str] = {}
    for name, label in [("aai", "assembly_api"), ("soniox", "soniox_api"), ("groq", "groq")]:
        i = txt.lower().find(label.lower())
        if i < 0:
            continue
        seg = txt[i + len(label): i + len(label) + 220]
        m = re.search(r"[A-Za-z0-9_\-]{16,}", seg)
        if m:
            keys[name] = m.group(0)
    missing = {"aai", "soniox", "groq"} - keys.keys()
    if missing:
        print(f"WARNING: missing keys for {missing}")
    return keys


# ---------------- providers ----------------

def aai_transcribe(wav: Path, key: str, keyterms: list[str] | None = None) -> tuple[str, float]:
    t0 = time.time()
    up = requests.post("https://api.assemblyai.com/v2/upload",
                       headers={"authorization": key}, data=wav.read_bytes(), timeout=120)
    up.raise_for_status()
    url = up.json()["upload_url"]
    body: dict = {"audio_url": url, "speech_models": [AAI_MODEL], "punctuate": True}
    if keyterms:
        body["keyterms_prompt"] = keyterms
    cr = requests.post("https://api.assemblyai.com/v2/transcript",
                       headers={"authorization": key}, json=body, timeout=60)
    cr.raise_for_status()
    tid = cr.json()["id"]
    while True:
        r = requests.get(f"https://api.assemblyai.com/v2/transcript/{tid}",
                         headers={"authorization": key}, timeout=60).json()
        if r["status"] == "completed":
            return r["text"], time.time() - t0
        if r["status"] == "error":
            raise RuntimeError(f"AAI error: {r.get('error')}")
        time.sleep(2)


def soniox_transcribe(wav: Path, key: str, terms: list[str] | None = None) -> tuple[str, float]:
    t0 = time.time()
    h = {"Authorization": f"Bearer {key}"}
    up = requests.post("https://api.soniox.com/v1/files", headers=h,
                       files={"file": (wav.name, wav.read_bytes(), "audio/wav")}, timeout=120)
    up.raise_for_status()
    fid = up.json()["id"]
    body: dict = {"model": SONIOX_MODEL, "file_id": fid, "language_hints": ["en"]}
    if terms:
        body["context"] = {"terms": terms}
    cr = requests.post("https://api.soniox.com/v1/transcriptions", headers=h, json=body, timeout=60)
    if cr.status_code >= 400:
        body["model"] = "stt-async-preview"
        cr = requests.post("https://api.soniox.com/v1/transcriptions", headers=h, json=body, timeout=60)
    cr.raise_for_status()
    tid = cr.json()["id"]
    while True:
        r = requests.get(f"https://api.soniox.com/v1/transcriptions/{tid}", headers=h, timeout=60).json()
        st = r.get("status")
        if st == "completed":
            break
        if st == "error":
            raise RuntimeError(f"Soniox error: {r.get('error_message')}")
        time.sleep(2)
    tr = requests.get(f"https://api.soniox.com/v1/transcriptions/{tid}/transcript", headers=h, timeout=60).json()
    text = tr.get("text")
    if not text and "tokens" in tr:
        text = "".join(t.get("text", "") for t in tr["tokens"])
    return text or "", time.time() - t0


def groq_transcribe(wav: Path, key: str) -> tuple[str, float]:
    t0 = time.time()
    r = requests.post("https://api.groq.com/openai/v1/audio/transcriptions",
                      headers={"Authorization": f"Bearer {key}"},
                      files={"file": (wav.name, wav.read_bytes(), "audio/wav")},
                      data={"model": GROQ_MODEL, "response_format": "json"}, timeout=120)
    r.raise_for_status()
    return r.json()["text"], time.time() - t0


# ---------------- scoring ----------------

_NORM = jiwer.Compose([
    jiwer.ToLowerCase(),
    jiwer.RemovePunctuation(),
    jiwer.RemoveMultipleSpaces(),
    jiwer.Strip(),
    jiwer.ReduceToListOfListOfWords(),
])


def score(ref: str, hyp: str) -> tuple[float, list[tuple[str, str]]]:
    if not hyp.strip():
        return 1.0, []
    out = jiwer.process_words(ref, hyp, reference_transform=_NORM, hypothesis_transform=_NORM)
    subs: list[tuple[str, str]] = []
    for sent_ref, sent_hyp, aligns in zip(out.references, out.hypotheses, out.alignments):
        for ch in aligns:
            if ch.type == "substitute":
                r = " ".join(sent_ref[ch.ref_start_idx:ch.ref_end_idx])
                h = " ".join(sent_hyp[ch.hyp_start_idx:ch.hyp_end_idx])
                subs.append((r, h))
    return out.wer, subs


def main() -> None:
    keys = load_keys()
    clips: list[tuple[str, str, Path, str]] = [
        ("test_sample", "read-script", ROOT / "test_sample.wav", TEST_SAMPLE_GT),
    ]
    for tag, dom in [("6046_w1", "algo-lecture"), ("6046_w2", "algo-lecture"),
                     ("6046_w3", "algo-lecture"), ("cs229_w1", "ml-lecture"),
                     ("cs229_w2", "ml-lecture")]:
        gt = clean_gt((SAMPLES / f"{tag}_gt.txt").read_text().strip())
        clips.append((tag, dom, SAMPLES / f"{tag}.wav", gt))

    providers = {
        "assemblyai": (aai_transcribe, keys.get("aai")),
        "soniox": (soniox_transcribe, keys.get("soniox")),
        "groq-whisper": (groq_transcribe, keys.get("groq")),
    }

    def run(clip, pname):
        tag, dom, wav, gt = clip
        fn, key = providers[pname]
        if not key:
            return (tag, dom, pname, None, None, None, "no key")
        try:
            cache = SAMPLES / f".cache_{tag}_{pname}.json"
            if cache.exists():
                d = json.loads(cache.read_text())
                text, dt = d["text"], d["sec"]
            else:
                text, dt = fn(wav, key)
                cache.write_text(json.dumps({"text": text, "sec": dt}))
            wer, subs = score(gt, text)
            return (tag, dom, pname, wer, dt, subs, text)
        except Exception as e:  # noqa: BLE001 - bench, report and continue
            return (tag, dom, pname, None, None, None, f"ERR: {e}")

    tasks = [(c, p) for c in clips for p in providers]
    results = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(run, c, p) for c, p in tasks]
        for f in cf.as_completed(futs):
            results.append(f.result())

    # ---- table ----
    order = {c[0]: i for i, c in enumerate(clips)}
    results.sort(key=lambda r: (order[r[0]], r[2]))
    print("\n" + "=" * 78)
    print(f"{'clip':<12}{'domain':<14}{'engine':<14}{'WER':>8}{'sec':>7}")
    print("-" * 78)
    agg: dict[str, list[float]] = {p: [] for p in providers}
    subs_by_engine: dict[str, list[tuple[str, str]]] = {p: [] for p in providers}
    for tag, dom, pname, wer, dt, subs, text in results:
        if wer is None:
            print(f"{tag:<12}{dom:<14}{pname:<14}{'FAIL':>8}{'':>7}  {text}")
            continue
        print(f"{tag:<12}{dom:<14}{pname:<14}{wer*100:>7.1f}%{dt:>7.1f}")
        agg[pname].append(wer)
        subs_by_engine[pname].extend(subs)
    print("-" * 78)
    print("AVG WER across clips:")
    for p in providers:
        if agg[p]:
            print(f"  {p:<14}{sum(agg[p])/len(agg[p])*100:>6.1f}%   (n={len(agg[p])})")
    print("\nNOTABLE SUBSTITUTIONS (ref -> hyp), technical terms surface here:")
    for p in providers:
        interesting = [(r, h) for r, h in subs_by_engine[p]
                       if len(r) > 6 or any(c.isupper() for c in r)]
        # dedup, keep first 18
        seen = set(); uniq = []
        for r, h in interesting:
            if (r, h) in seen:
                continue
            seen.add((r, h)); uniq.append((r, h))
        print(f"\n  [{p}] {len(subs_by_engine[p])} total subs; sample:")
        for r, h in uniq[:18]:
            print(f"      {r!r} -> {h!r}")


if __name__ == "__main__":
    main()
