"""Decisive keyterms test: measure lift on terms ACTUALLY SPOKEN (from ground truth),
on the clips that HAVE real ground truth — the rare-jargon script + Indian-accented Java.

Recall denominator = keyterms present in the GT (not the whole glossary). This is the
correct way to ask "did biasing recover terms the baseline missed?".

Run: uv run --with jiwer --with requests python eval/keyterms_probe.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import jiwer  # noqa: E402
from stt_compare import (  # noqa: E402
    _NORM, TEST_SAMPLE_GT, aai_transcribe, load_keys, soniox_transcribe,
)
from make_interview_clips import JAVA_KT  # noqa: E402

SAMPLES = ROOT / "samples"
KEYS = load_keys()

JARGON23 = [
    "Kafka", "Airflow", "DAG", "idempotent", "concurrency", "mutex",
    "optimistic-locking", "PostgreSQL", "Redis", "write-through", "linearizability",
    "eventual consistency", "CRDT", "conflict-free replicated data type", "backpressure",
    "sharded", "gRPC", "JWTs", "memoized", "quorum", "Kubernetes", "multi-tenant",
    "microservices", "version column", "critical section", "aggregate", "clickstream",
]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def spoken(gt: str, terms: list[str]) -> list[str]:
    hay = " " + norm(gt) + " "
    return [t for t in terms if (" " + norm(t) + " ") in hay]


def present(text: str, terms: list[str]) -> set[str]:
    hay = " " + norm(text) + " "
    return {t for t in terms if (" " + norm(t) + " ") in hay}


def wer(ref: str, hyp: str) -> float:
    return jiwer.process_words(ref, hyp, reference_transform=_NORM,
                               hypothesis_transform=_NORM).wer if hyp.strip() else 1.0


CLIPS = [
    ("test_sample", ROOT / "test_sample.wav", TEST_SAMPLE_GT, JARGON23),
    ("tcs_w1", SAMPLES / "tcs_w1.wav", (SAMPLES / "tcs_w1_ref.txt").read_text(), JAVA_KT),
    ("tcs_w2", SAMPLES / "tcs_w2.wav", (SAMPLES / "tcs_w2_ref.txt").read_text(), JAVA_KT),
]

for name, wav, gt, kt in CLIPS:
    sp = spoken(gt, kt)
    print(f"\n{'='*80}\n{name}  — {len(sp)} keyterms actually spoken: {sp}")
    ab, _ = aai_transcribe(wav, KEYS["aai"])
    ak, _ = aai_transcribe(wav, KEYS["aai"], keyterms=kt)
    sb, _ = soniox_transcribe(wav, KEYS["soniox"])
    sc, _ = soniox_transcribe(wav, KEYS["soniox"], terms=kt)
    for label, txt, base in [("AAI base", ab, None), ("AAI +keyterms", ak, ab),
                             ("Soniox base", sb, None), ("Soniox +context", sc, sb)]:
        got = present(txt, sp)
        line = f"  {label:<16} WER {wer(gt, txt)*100:5.1f}%   spoken-term recall {len(got)}/{len(sp)}"
        if base is not None:
            recovered = got - present(base, sp)
            lost = present(base, sp) - got
            if recovered:
                line += f"   RECOVERED: {sorted(recovered)}"
            if lost:
                line += f"   LOST: {sorted(lost)}"
        print(line)
