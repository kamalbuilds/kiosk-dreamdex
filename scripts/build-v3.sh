#!/usr/bin/env bash
# Assemble the Kiosk film v3.
#
# Structure follows the launch-demo-film arc: problem, what it is, how it works, the
# wallet, the money, proof, future, call to action. Each beat is one narration file
# and one visual source, and the visual is always cut to the narration's length so no
# beat can drift into dead air.
#
# Visual sources are of three kinds:
#   diag   a still Archify diagram, held with a slow drift
#   card   page-capture frames of the kiosk column, centred on the brand canvas
#   wide   full-page capture frames cropped to 16:9
#
# AUDIO_DIR selects the voice. Voice B lives in /tmp/voiceb, the fallback in
# /tmp/kioskaudio. The script refuses to mix directories, because one video with two
# voices reads as broken.
set -euo pipefail

AUDIO_DIR="${AUDIO_DIR:-/tmp/voiceb}"
DIAG=/Users/kamal/Desktop/dorahacks/somnia/kiosk/diagrams
FR=/tmp/kioskv2
RABBY=/tmp/rabbyframes
WORK=/tmp/kioskv3
OUT="${1:-/tmp/kiosk-demo-v3.mp4}"
W=1920; H=1080; BG=0x070c0a

rm -rf "$WORK"; mkdir -p "$WORK"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# beat: <id> <audio-basename> <kind> <source> [from] [count]
BEATS=(
  "b1 v1 diag $DIAG/problem.png"
  "b2 v2 diag $DIAG/solution.png"
  "b3 v3 card $FR/B2-widget 10 120"
  "b4 v5 approval $RABBY 136 334"
  "b5 v4 diag $DIAG/moneypath.png"
  "b6 v6 kiosk $RABBY 470 119"
  "b7 v7 wide $FR/D-dash 0 92"
  "b8 v8 card_end -"
)

stage() {  # stage <id> <srcdir> <from> <count>
  local out="$WORK/s-$1"; rm -rf "$out"; mkdir -p "$out"
  local k=0 i=0
  for f in $(ls "$2"/*.png 2>/dev/null | sort); do
    if [ "$i" -ge "$3" ] && [ "$k" -lt "$4" ]; then
      cp "$f" "$(printf '%s/f%04d.png' "$out" "$k")"; k=$((k+1))
    fi
    i=$((i+1))
  done
  echo "$k"
}

from_frames() {  # from_frames <stagedir> <seconds> <mode> <out>
  local dir="$1" secs="$2" mode="$3" out="$4" n rate vf frames
  n=$(ls "$dir"/*.png 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] || return 1
  frames=$(/usr/bin/python3 -c "print(int(round(30*$secs)))")
  rate=$(/usr/bin/python3 -c "print(max(0.4, $n/$secs))")
  if [ "$mode" = "approval" ]; then
    # Portrait wallet window: fit to height, centre on the brand canvas.
    vf="scale=-2:1000:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},fps=30,format=yuv420p"
  elif [ "$mode" = "kiosk" ]; then
    # Widget capture: the kiosk occupies the left 1140px of a 2940 wide frame.
    vf="crop=1140:1684:0:0,scale=-2:1010:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},fps=30,format=yuv420p"
  elif [ "$mode" = "card" ]; then
    vf="crop=840:1240:0:0,scale=-2:1010:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},fps=30,format=yuv420p"
  else
    vf="scale=${W}:-2:flags=lanczos,crop=${W}:${H}:0:0,fps=30,format=yuv420p"
  fi
  ffmpeg -y -loglevel error -framerate "$rate" -pattern_type glob -i "$dir/f*.png" \
    -vf "$vf" -frames:v "$frames" -c:v libx264 -preset medium -crf 19 "$out"
}

from_still() {  # from_still <png> <seconds> <out>
  local frames
  frames=$(/usr/bin/python3 -c "print(int(round(30*$2)))")
  ffmpeg -y -loglevel error -loop 1 -i "$1" -r 30 \
    -vf "scale=${W}:-2:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},zoompan=z='min(zoom+0.00025,1.06)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,format=yuv420p" \
    -frames:v "$frames" -c:v libx264 -preset medium -crf 19 "$3"
}

echo "voice: $AUDIO_DIR"
# Check each extension separately: `ls a.wav a.mp3` exits non-zero when only one
# pattern matches, which made a directory of eight wavs report as empty.
# `|| true` is load-bearing: under pipefail a non-matching glob makes ls exit
# non-zero, the command substitution inherits it, and set -e kills the script.
naud=$( { ls "$AUDIO_DIR"/*.wav 2>/dev/null || true; } | wc -l)
naud=$((naud + $( { ls "$AUDIO_DIR"/*.mp3 2>/dev/null || true; } | wc -l)))
[ "$naud" -gt 0 ] || { echo "no audio in $AUDIO_DIR"; exit 1; }
echo "  $naud narration files"

: > "$WORK/v.txt"; : > "$WORK/a.txt"
for spec in "${BEATS[@]}"; do
  set -- $spec
  id="$1"; aud="$2"; kind="$3"; src="$4"; from="${5:-0}"; cnt="${6:-999}"
  a=""
  for ext in wav mp3; do
    [ -f "$AUDIO_DIR/seg$aud.$ext" ] && a="$AUDIO_DIR/seg$aud.$ext"
  done
  [ -n "$a" ] || { echo "  $id: MISSING audio seg$aud"; continue; }
  d=$(dur "$a")
  case "$kind" in
    diag)
      [ -f "$src" ] || { echo "  $id: MISSING diagram $src"; continue; }
      from_still "$src" "$d" "$WORK/$id.mp4" ;;
    card_end)
      /usr/bin/python3 "$(dirname "$0")/make-cards.py" >/dev/null
      ffmpeg -y -loglevel error -loop 1 -i /tmp/kioskcards/end.png -t "$d" -r 30 \
        -vf "scale=${W}:${H},format=yuv420p" -c:v libx264 -preset medium -crf 19 "$WORK/$id.mp4" ;;
    *)
      n=$(stage "$id" "$src" "$from" "$cnt"); from_frames "$WORK/s-$id" "$d" "$kind" "$WORK/$id.mp4" ;;
  esac
  printf "  %-3s %-4s %-6s %ss\n" "$id" "$aud" "$kind" "${d:0:5}"
  echo "file '$WORK/$id.mp4'" >> "$WORK/v.txt"
  echo "file '$a'" >> "$WORK/a.txt"
done

ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/v.txt" -c copy "$WORK/video.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/a.txt" -ar 44100 -ac 2 -c:a pcm_s16le "$WORK/voice.wav"
ffmpeg -y -loglevel error -i "$WORK/video.mp4" -i "$WORK/voice.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "done: $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
echo "silence check (gap >= 1.5s is a defect):"
ffmpeg -i "$OUT" -af silencedetect=noise=-35dB:d=1.5 -f null - 2>&1 | grep -i "silence_" || echo "  none"
