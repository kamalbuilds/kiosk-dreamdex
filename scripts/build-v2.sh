#!/usr/bin/env bash
# Assemble the Kiosk film from page-only capture frames and narration.
#
# The frames are real motion captured at ~11fps while the interface was driven, so
# countdowns and order books move because they moved, not because a pan was applied.
#
# Two framings:
#   wide  full-page shots (host page, dashboard) cropped to 16:9 from the top
#   card  the kiosk itself, which occupies a narrow column, cropped out of the frame
#         and centred on the product's own enamel black so it fills the screen
set -euo pipefail

SRC=/tmp/kioskv2
AUD=/tmp/kioskaudio
WORK=/tmp/kioskbuild
OUT="${1:-/tmp/kiosk-demo-v2.mp4}"
W=1920; H=1080
BG=0x070c0a

rm -rf "$WORK"; mkdir -p "$WORK"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

stage() {  # stage <id> <srcdir> <from> <count>
  local id="$1" dir="$2" from="$3" count="$4"
  local out="$WORK/s-$id"; rm -rf "$out"; mkdir -p "$out"
  local k=0 i=0
  for f in $(ls "$dir"/*.png 2>/dev/null | sort); do
    if [ "$i" -ge "$from" ] && [ "$k" -lt "$count" ]; then
      cp "$f" "$(printf '%s/f%04d.png' "$out" "$k")"
      k=$((k+1))
    fi
    i=$((i+1))
  done
  echo "$out"
}

clip() {  # clip <stagedir> <seconds> <mode> <out>
  local dir="$1" secs="$2" mode="$3" out="$4"
  local n frames rate vf
  n=$(ls "$dir"/*.png 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] || { echo "no frames in $dir"; return 1; }
  frames=$(/usr/bin/python3 -c "print(int(round(30*$secs)))")
  # Play the captured frames across the narration's length, holding the last if short.
  rate=$(/usr/bin/python3 -c "print(max(0.4, $n/$secs))")
  if [ "$mode" = "card" ]; then
    vf="crop=840:1240:0:0,scale=-2:1010:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},fps=30,format=yuv420p"
  else
    vf="scale=${W}:-2:flags=lanczos,crop=${W}:${H}:0:0,fps=30,format=yuv420p"
  fi
  ffmpeg -y -loglevel error -framerate "$rate" -pattern_type glob -i "$dir/f*.png" \
    -vf "$vf" -frames:v "$frames" -c:v libx264 -preset medium -crf 19 "$out"
}

echo "segments"
declare -a IDS=(v1 03 v3 v4 05 06)
declare -a DIRS=("$SRC/A-host" "$SRC/A-host" "$SRC/B2-widget" "$SRC/B2-widget" "$SRC/D-dash" "$SRC/B2-widget")
declare -a FROM=(0 40 10 110 0 200)
declare -a CNT=(44 44 120 118 92 50)
declare -a MODE=(wide wide card card wide card)

for i in 0 1 2 3 4 5; do
  id=${IDS[$i]}
  a="$AUD/seg$id.mp3"
  [ -f "$a" ] || { echo "missing $a"; exit 1; }
  d=$(dur "$a")
  sd=$(stage "$id" "${DIRS[$i]}" "${FROM[$i]}" "${CNT[$i]}")
  printf "  %s  %-6ss  %-4s  %s frames\n" "$id" "${d:0:5}" "${MODE[$i]}" "$(ls $sd | wc -l | tr -d ' ')"
  clip "$sd" "$d" "${MODE[$i]}" "$WORK/$id.mp4"
done

echo "end card"
/usr/bin/python3 "$(dirname "$0")/make-cards.py" >/dev/null
d6=$(/usr/bin/python3 -c "print($(dur "$AUD/seg07.mp3") + $(dur "$AUD/segv6.mp3"))")
ffmpeg -y -loglevel error -loop 1 -i /tmp/kioskcards/end.png -t "$d6" -r 30 \
  -vf "scale=${W}:${H},format=yuv420p" -c:v libx264 -preset medium -crf 19 "$WORK/v6.mp4"

echo "concat"
: > "$WORK/v.txt"; : > "$WORK/a.txt"
for id in v1 03 v3 v4 05 06; do
  echo "file '$WORK/$id.mp4'" >> "$WORK/v.txt"
  echo "file '$AUD/seg$id.mp3'" >> "$WORK/a.txt"
done
echo "file '$WORK/v6.mp4'" >> "$WORK/v.txt"
echo "file '$AUD/seg07.mp3'" >> "$WORK/a.txt"
echo "file '$AUD/segv6.mp3'" >> "$WORK/a.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/v.txt" -c copy "$WORK/video.mp4"
# Re-encoded, not stream-copied: copying mp3 frames produces non monotonic dts at each
# join, which is audible as a click.
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/a.txt" -ar 44100 -ac 2 -c:a pcm_s16le "$WORK/voice.wav"

ffmpeg -y -loglevel error -i "$WORK/video.mp4" -i "$WORK/voice.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "done: $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
echo "silence check (any gap >= 1.5s is a defect):"
ffmpeg -i "$OUT" -af silencedetect=noise=-35dB:d=1.5 -f null - 2>&1 | grep -i "silence_" || echo "  none"
