"""Cut jargon-dense windows from the 4 downloaded interview videos + emit a clip config.

TCS Java has a manual (verbatim) caption -> real ground truth. The other three are
auto-caption-only: we use those captions ONLY to locate dense windows and as a weak
silver reference, never as authoritative WER ground truth (flagged ref_kind).

Writes: samples/<clip>.wav (16k mono) + samples/interview_clips.json
Run:  python eval/make_interview_clips.py
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

SAMPLES = Path(__file__).resolve().parent / "samples"

# per-domain keyterm/context biasing lists (the "rubric jargon" known before an interview)
JAVA_KT = [
    "Java", "JVM", "JDK", "class", "object", "method", "static", "void", "public",
    "private", "String", "StringBuilder", "Integer", "ArrayList", "LinkedList",
    "HashMap", "HashSet", "collection", "generics", "interface", "abstract",
    "inheritance", "polymorphism", "encapsulation", "abstraction", "overloading",
    "overriding", "constructor", "try-catch", "exception", "checked exception",
    "runtime exception", "finally", "throw", "throws", "thread", "synchronized",
    "volatile", "final", "immutable", "garbage collection", "Spring", "Hibernate",
    "servlet", "JDBC", "lambda", "stream", "serialization", "main method",
    "ArithmeticException", "NullPointerException",
]
DSA_KT = [
    "array", "string", "substring", "subarray", "hash map", "hash table", "hash set",
    "linked list", "binary tree", "binary search tree", "binary search", "node",
    "pointer", "two pointer", "sliding window", "recursion", "backtracking",
    "dynamic programming", "memoization", "greedy", "divide and conquer", "stack",
    "queue", "priority queue", "heap", "graph", "adjacency list", "breadth first search",
    "depth first search", "BFS", "DFS", "traversal", "time complexity", "space complexity",
    "big O", "O of n", "logarithmic", "quadratic", "constant time", "linear time",
    "in-place", "sorted", "index", "integer overflow", "modulo", "brute force", "optimal",
]
SE_KT = [
    "algorithm", "function", "variable", "array", "string", "hash map", "dictionary",
    "loop", "recursion", "complexity", "big O", "boolean", "integer", "API", "endpoint",
    "database", "SQL", "query", "index", "cache", "class", "object", "method", "runtime",
    "edge case", "test case", "null", "pointer", "refactor", "data structure", "hash",
    "sort", "search", "binary search", "linked list", "stack", "queue", "time complexity",
]

# (clip, srt, ref_kind, video_stub, domain, keyterms)
CLIPS = [
    ("tcs_w",   "tcs_java.en-US.srt", "manual", "tcs_java",  "java", JAVA_KT),
    ("fcc_w",   "fcc_se_auto.en.srt", "auto",   "fcc_se",    "se",   SE_KT),
    ("striver_w","striver_auto.en.srt","auto",  "striver",   "dsa",  DSA_KT),
    ("amazon_w","amazon_auto.en.srt", "auto",   "amazon",    "dsa",  DSA_KT),
]

DENSITY = [w.lower() for w in set(JAVA_KT + DSA_KT + SE_KT)]


def parse_srt(path: Path):
    blocks = re.split(r"\n\n+", path.read_text(errors="ignore").strip())
    def to_s(ts):
        h, m, rest = ts.split(":"); s, ms = rest.split(","); return int(h)*3600+int(m)*60+int(s)+int(ms)/1000
    cues = []
    for b in blocks:
        lines = b.strip().split("\n")
        tl = [l for l in lines if "-->" in l]
        if not tl:
            continue
        a, bb = tl[0].split("-->")
        txt = " ".join(lines[lines.index(tl[0]) + 1:]).strip()
        txt = re.sub(r"<[^>]+>", "", txt)
        if txt:
            cues.append((to_s(a.strip()), to_s(bb.strip()), txt))
    return cues


def score(t: str) -> int:
    t = t.lower(); return sum(t.count(j) for j in DENSITY)


def main() -> None:
    config = []
    W = 95
    for prefix, srt, kind, stub, domain, kt in CLIPS:
        cues = parse_srt(SAMPLES / srt)
        if not cues:
            print(f"!! no cues for {srt}"); continue
        dur = cues[-1][1]
        wins, t = [], 60  # skip the first minute (intros)
        while t < dur - 40:
            seg = [c for c in cues if t <= (c[0]+c[1])/2 < t + W]
            if seg:
                wins.append((score(" ".join(c[2] for c in seg)), seg[0][0], seg[-1][1],
                             " ".join(c[2] for c in seg)))
            t += 15
        wins.sort(reverse=True)
        chosen = []
        for w in wins:
            if any(not (w[2] <= c[1] or w[1] >= c[2]) for c in chosen):
                continue
            chosen.append(w)
            if len(chosen) == 2:
                break
        chosen.sort(key=lambda x: x[1])
        src = next(SAMPLES.glob(f"{stub}_full.*"))
        for i, (sc, a, b, txt) in enumerate(chosen, 1):
            wav = SAMPLES / f"{prefix}{i}.wav"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                            "-ss", f"{a:.2f}", "-to", f"{b:.2f}", "-ar", "16000",
                            "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)
            ref = re.sub(r"\s+", " ", txt).strip()
            (SAMPLES / f"{prefix}{i}_ref.txt").write_text(ref + "\n")
            config.append({"name": f"{prefix}{i}", "wav": str(wav),
                           "ref_kind": kind, "domain": domain, "keyterms": kt,
                           "range": [round(a), round(b)]})
            print(f"{prefix}{i}: [{a:.0f}-{b:.0f}]s dur={b-a:.0f}s density={sc} kind={kind}")
            print(f"   ref: {ref[:130]}...")
    (SAMPLES / "interview_clips.json").write_text(json.dumps(config, indent=1))
    print(f"\nwrote {len(config)} clips -> interview_clips.json")


if __name__ == "__main__":
    main()
