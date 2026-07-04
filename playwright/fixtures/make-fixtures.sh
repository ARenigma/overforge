#!/usr/bin/env bash
# Generates the fake-media fixtures for the mimic harness. All are optional — the specs degrade
# gracefully without them (silence.wav -> default fake device; face.y4m -> no-face proctor still
# proceeds; answer.wav absent -> the STT smoke test skips). Requires ffmpeg; answer.wav uses
# macOS `say` for a free TTS clip (swap in any TTS on Linux CI).
set -euo pipefail
cd "$(dirname "$0")"

command -v ffmpeg >/dev/null || { echo "ffmpeg required (brew install ffmpeg)"; exit 1; }

# 1) Silent mic for the text-driven mimic — keeps the voice STT path quiet so it can't race typing.
echo "-> silence.wav (1s, 48kHz mono s16)"
ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono -t 1 -sample_fmt s16 silence.wav </dev/null 2>/dev/null

# 2) Face video for the proctor (optional). Provide a real frontal headshot as face.jpg first;
#    MediaPipe BlazeFace needs a real face (>=80px wide, centered) to register.
if [ -f face.jpg ]; then
  echo "-> face.y4m (from face.jpg, 640x480 @15fps, 3s)"
  ffmpeg -y -loop 1 -i face.jpg -t 3 -r 15 -vf scale=640:480 -pix_fmt yuv420p face.y4m </dev/null 2>/dev/null
else
  echo "-- face.jpg not found; skipping face.y4m (proctor will note faceAbsent but the run proceeds)"
fi

# 3) Spoken answer for the STT smoke test: 3s leading silence (clears the AEC warm-up) + speech,
#    resampled to the STT's expected 48kHz mono s16le.
if command -v say >/dev/null; then
  echo "-> answer.wav (3s silence + speech, 48kHz mono s16)"
  say -o /tmp/of-say.aiff "My approach is to iterate through the input, track the running total, and return the result at the end."
  # -t 3 BEFORE the anullsrc -i caps that (infinite) input to 3s; input 1 is the speech clip.
  ffmpeg -y -t 3 -f lavfi -i anullsrc=r=48000:cl=mono -i /tmp/of-say.aiff \
    -filter_complex '[0][1:a]concat=n=2:v=0:a=1[a]' -map '[a]' \
    -ar 48000 -ac 1 -sample_fmt s16 answer.wav </dev/null 2>/dev/null
  rm -f /tmp/of-say.aiff
else
  echo "-- 'say' not found (non-macOS); skipping answer.wav — provide your own 48kHz mono s16 WAV with 3s leading silence to enable the STT smoke test"
fi

echo "done. fixtures:"; ls -1 *.y4m *.wav 2>/dev/null || true
