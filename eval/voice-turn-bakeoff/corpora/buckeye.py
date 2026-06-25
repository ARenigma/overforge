"""Turn-detection clips from the Buckeye corpus — REAL conversational speech with REAL pauses.

Buckeye dialogues mark the interviewer as <IVER>, silences as <SIL>, plus word-level timing.
Per interviewee turn (a run of speech between <IVER> blocks) we emit, in the same
(audio, is_complete) contract as the Smart Turn dataset:
  - HOLD clips: lead-in audio ending at an INTRA-turn silence (the speaker paused but RESUMED) →
    is_complete=False. A detector that fires here = false cutoff (the interview-killing error).
  - EOT clips: lead-in audio ending where the turn actually ends (interviewer/recording follows) →
    is_complete=True.
Tracks are nested zips (recordings/sNN/sNNNNx.zip → .wav + .words).
"""
from __future__ import annotations

import io
import logging
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

_SR = 16_000
_MIN_HOLD_SIL = 0.5     # only silences >= this count as pauses worth probing
_MIN_TURN_WORDS = 3     # ignore trivial turns
_PRE_CONTEXT = 8.0      # max seconds of lead-in fed to the detector (model sees last 8s anyway)
_RECORDINGS = Path("/Users/amit.ranjan/overforge/recordings")


@dataclass
class Seg:
    start: float
    end: float
    label: str
    kind: str  # word | sil | iver | noise


def _classify(label: str) -> str:
    l = label.strip()
    if l == "<SIL>":
        return "sil"
    if l.startswith("<IVER"):
        return "iver"
    if l.startswith("<") or l.startswith("{"):
        return "noise"
    return "word"


def parse_words(text: str) -> list[Seg]:
    lines = text.splitlines()
    try:
        start_idx = lines.index("#") + 1
    except ValueError:
        start_idx = 9
    segs: list[Seg] = []
    prev_end = 0.0
    for ln in lines[start_idx:]:
        ln = ln.strip()
        if not ln:
            continue
        m = re.match(r"^([0-9.]+)\s+\d+\s+(.*)$", ln)
        if not m:
            continue
        end = float(m.group(1))
        label = m.group(2).split(";")[0].strip()
        segs.append(Seg(prev_end, end, label, _classify(label)))
        prev_end = end
    return segs


def _bucket(dur: float) -> str:
    if dur < 1.0:
        return "0.5-1s"
    if dur < 2.0:
        return "1-2s"
    if dur < 3.0:
        return "2-3s"
    if dur < 5.0:
        return "3-5s"
    return "5s+"


def extract_clips_from_track(
    wav: np.ndarray, segs: list[Seg], track_id: str, max_hold: int = 30, max_eot: int = 30
) -> list[dict]:
    # Turns = runs of non-<IVER> segments containing enough real words.
    turns: list[list[Seg]] = []
    cur: list[Seg] = []
    for s in segs:
        if s.kind == "iver":
            if cur:
                turns.append(cur)
                cur = []
        else:
            cur.append(s)
    if cur:
        turns.append(cur)

    clips: list[dict] = []
    n_hold = n_eot = 0
    for turn in turns:
        words = [s for s in turn if s.kind == "word"]
        if len(words) < _MIN_TURN_WORDS:
            continue
        turn_start = turn[0].start
        last_word_end = words[-1].end

        # HOLD: a silence with at least one more word later in the same turn (speaker resumed).
        for i, s in enumerate(turn):
            if n_hold >= max_hold:
                break
            if s.kind != "sil" or s.end >= last_word_end:
                continue
            dur = s.end - s.start
            if dur < _MIN_HOLD_SIL:
                continue
            # Probe ~1s into the pause (as a real detector would, after VAD silence), so the
            # model judges the SAME way for HOLD and EOT — by prosody before a short trailing silence.
            probe_t = s.start + min(dur, 1.0)
            clip_start = max(turn_start, probe_t - _PRE_CONTEXT)
            a = wav[int(clip_start * _SR) : int(probe_t * _SR)]
            if len(a) < int(0.5 * _SR):
                continue
            clips.append(
                {
                    "clip_id": f"{track_id}_hold{i}",
                    "audio": a.astype(np.float32),
                    "sample_rate": _SR,
                    "is_complete": False,
                    "pause_bucket": _bucket(dur),
                    "pause_dur": dur,
                    "source": f"buckeye/{track_id}",
                }
            )
            n_hold += 1

        # EOT: end of the turn (interviewer/recording follows).
        if n_eot < max_eot:
            # Include ~1s of trailing (post-turn) silence so the model sees the pause that
            # signals completion — mirrors the HOLD probe and how Smart Turn fires in production.
            probe_t = min(last_word_end + 1.0, len(wav) / _SR)
            clip_start = max(turn_start, probe_t - _PRE_CONTEXT)
            a = wav[int(clip_start * _SR) : int(probe_t * _SR)]
            if len(a) >= int(0.5 * _SR):
                clips.append(
                    {
                        "clip_id": f"{track_id}_eot{int(turn_start)}",
                        "audio": a.astype(np.float32),
                        "sample_rate": _SR,
                        "is_complete": True,
                        "pause_bucket": "eot",
                        "pause_dur": 0.0,
                        "source": f"buckeye/{track_id}",
                    }
                )
                n_eot += 1
    return clips


@dataclass
class Turn:
    """A full interviewee turn with intra-turn structure preserved for STREAMING replay.

    Unlike the pre-cut HOLD/EOT clips above, a Turn carries the whole run of speech as ONE
    contiguous audio slice plus the timeline a streaming detector needs:
      - `audio`       : the turn's audio from first word to ~1s after the last word (16 kHz mono).
      - `hold_pauses` : (start, end) of each INTRA-turn pause >= _MIN_HOLD_SIL, RELATIVE to audio
                        start. Smart Turn firing inside one of these = a false cutoff.
      - `last_word_end`: time of the final word, relative to audio start (the true turn boundary).
      - `transcript_words`: the corpus word labels, a reference to sanity-check the STT output.
    """

    turn_id: str
    audio: np.ndarray
    sample_rate: int
    hold_pauses: list[tuple[float, float]]
    last_word_end: float  # seconds, relative to audio[0]
    n_words: int
    transcript_words: str
    source: str


def extract_turns_from_track(
    wav: np.ndarray, segs: list[Seg], track_id: str, max_turns: int = 30
) -> list[Turn]:
    """Whole interviewee turns (between <IVER> blocks) with intra-turn pause structure preserved.

    A turn qualifies only if it has >= _MIN_TURN_WORDS real words AND at least one intra-turn
    thinking-pause >= _MIN_HOLD_SIL — otherwise there is nothing to false-cutoff on, so the turn
    doesn't exercise the interview-killing failure mode this harness exists to measure.
    """
    runs: list[list[Seg]] = []
    cur: list[Seg] = []
    for s in segs:
        if s.kind == "iver":
            if cur:
                runs.append(cur)
                cur = []
        else:
            cur.append(s)
    if cur:
        runs.append(cur)

    turns: list[Turn] = []
    for run in runs:
        if len(turns) >= max_turns:
            break
        words = [s for s in run if s.kind == "word"]
        if len(words) < _MIN_TURN_WORDS:
            continue
        turn_start = words[0].start
        last_word_end = words[-1].end

        # Intra-turn pauses: silences that END before the last word (speaker resumed after).
        hold_pauses: list[tuple[float, float]] = []
        for s in run:
            if s.kind != "sil" or s.end >= last_word_end:
                continue
            if (s.end - s.start) < _MIN_HOLD_SIL:
                continue
            hold_pauses.append((s.start - turn_start, s.end - turn_start))
        if not hold_pauses:
            continue  # no thinking-pause → nothing to test false-cutoff against

        # Audio = first word → ~1s past the last word (the trailing silence that signals EOT).
        audio_end = min(last_word_end + 1.0, len(wav) / _SR)
        a = wav[int(turn_start * _SR) : int(audio_end * _SR)].astype(np.float32)
        if len(a) < int(1.0 * _SR):
            continue

        turns.append(
            Turn(
                turn_id=f"{track_id}_turn{int(turn_start)}",
                audio=a,
                sample_rate=_SR,
                hold_pauses=hold_pauses,
                last_word_end=last_word_end - turn_start,
                n_words=len(words),
                transcript_words=" ".join(w.label for w in words),
                source=f"buckeye/{track_id}",
            )
        )
    return turns


def fetch_turns(
    n_turns: int = 10, max_tracks: int = 12, speakers: list[str] | None = None
) -> list[Turn]:
    """Fetch up to `n_turns` whole interviewee turns (each with >=1 intra-turn pause) for
    streaming replay. Walks tracks until enough qualifying turns are collected, taking at most a
    few per track so the sample spans multiple speakers."""
    spk_dirs = sorted(
        d for d in _RECORDINGS.iterdir() if d.is_dir() and re.match(r"s\d{2}$", d.name)
    )
    if speakers:
        spk_dirs = [d for d in spk_dirs if d.name in speakers]

    turns: list[Turn] = []
    n_tracks = 0
    for sd in spk_dirs:
        if len(turns) >= n_turns:
            break
        for zp in sorted(sd.glob("*.zip")):
            if len(turns) >= n_turns or n_tracks >= max_tracks:
                break
            loaded = _load_track_from_zip(zp)
            if loaded is None:
                continue
            wav, segs, tid = loaded
            track_turns = extract_turns_from_track(wav, segs, tid, max_turns=3)
            turns.extend(track_turns)
            n_tracks += 1
            logger.info("Track %s: %d qualifying turns", tid, len(track_turns))
    turns = turns[:n_turns]
    logger.info("Buckeye: %d streaming turns from %d tracks", len(turns), n_tracks)
    return turns


def _load_track_from_zip(zip_path: Path):
    try:
        with zipfile.ZipFile(zip_path) as z:
            names = z.namelist()
            wav_name = next((n for n in names if n.endswith(".wav")), None)
            words_name = next((n for n in names if n.endswith(".words")), None)
            if not wav_name or not words_name:
                return None
            wav, sr = sf.read(io.BytesIO(z.read(wav_name)), dtype="float32")
            if wav.ndim > 1:
                wav = wav.mean(axis=1)
            if sr != _SR:
                import librosa

                wav = librosa.resample(wav, orig_sr=sr, target_sr=_SR)
            words_text = z.read(words_name).decode("latin-1", errors="replace")
            return wav, parse_words(words_text), zip_path.stem
    except Exception:
        logger.exception("Failed to load %s", zip_path)
        return None


def fetch(max_tracks: int = 8, speakers: list[str] | None = None) -> list[dict]:
    spk_dirs = sorted(
        d for d in _RECORDINGS.iterdir() if d.is_dir() and re.match(r"s\d{2}$", d.name)
    )
    if speakers:
        spk_dirs = [d for d in spk_dirs if d.name in speakers]
    clips: list[dict] = []
    n_tracks = 0
    for sd in spk_dirs:
        for zp in sorted(sd.glob("*.zip")):
            if n_tracks >= max_tracks:
                break
            loaded = _load_track_from_zip(zp)
            if loaded is None:
                continue
            wav, segs, tid = loaded
            tc = extract_clips_from_track(wav, segs, tid)
            clips.extend(tc)
            n_tracks += 1
            logger.info(
                "Track %s: %d clips (%d hold / %d eot)",
                tid, len(tc),
                sum(1 for c in tc if not c["is_complete"]),
                sum(1 for c in tc if c["is_complete"]),
            )
        if n_tracks >= max_tracks:
            break
    logger.info(
        "Buckeye: %d clips from %d tracks (%d hold / %d eot)",
        len(clips), n_tracks,
        sum(1 for c in clips if not c["is_complete"]),
        sum(1 for c in clips if c["is_complete"]),
    )
    return clips
