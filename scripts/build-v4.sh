#!/usr/bin/env bash
# Assemble the Kiosk film v4.
#
# What changed from v3, and why:
#   - The problem is EVIDENCED before it is diagrammed. A real untraded market and real
#     people arguing about the same question come first; the diagram only appears when
#     the narrator is actually describing the diagram.
#   - The product is shown in a REAL BROWSER WINDOW, chrome and all, so a viewer can
#     see the widget sitting inside somebody else's article rather than floating on a
#     black canvas.
#   - Diagrams are animated clips that reveal in the order the narrator explains them.
#   - The features get their own beat and are named out loud.
#
# Beat kinds:
#   still   one image, slow push in
#   stills  several images, split evenly across the narration line
#   clip    an mp4 of real screen video, fitted to frame
#   card    the end card
set -uo pipefail

AUDIO_DIR="${AUDIO_DIR:-/tmp/voiceb}"
EV=/tmp/evidence
DC=/tmp/diagclips
SH=/tmp/shots
WORK=/tmp/kioskv4
OUT="${1:-/tmp/kiosk-demo-v4.mp4}"
W=1920; H=1080; BG=0x070c0a

rm -rf "$WORK"; mkdir -p "$WORK"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" 2>/dev/null; }

# beat: <id> <audio> <kind> <source...>
BEATS=(
  "c1 w1 still  $EV/dead-market.png"
  "c2 w2 stills $EV/argument-1.png $EV/argument-2.png"
  "c3 w3 clip   $DC/problem.mp4"
  "c4 w4 clip   $SH/embed-reveal.mp4"
  "c5 w5 clip   $SH/embed-reveal.mp4"
  "c6 w6 clip   $SH/trade.mp4"
  "c7 w7 clip   $DC/moneypath.mp4"
  "c8 w8 clip   $SH/dashboard.mp4"
  "c9 w9 card   -"
)

# Fit any source to 1920x1080 without cropping content away: scale to fit, pad the rest
# with the product's own background. Losing a number off the edge of a frame is worse
# than a little letterboxing.
FIT="scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},fps=30,format=yuv420p"

from_clip() {  # from_clip <mp4> <seconds> <out>
  local src="$1" secs="$2" out="$3" slen
  slen=$(dur "$src")
  # If the clip is shorter than its narration, slow it to fit rather than freezing on
  # a held last frame, which reads as a stall.
  local ratio
  ratio=$(/usr/bin/python3 -c "
s=$slen; d=$secs
print('%.6f' % (d/s if s>0 else 1))")
  if /usr/bin/python3 -c "import sys; sys.exit(0 if $ratio > 1.02 else 1)"; then
    ffmpeg -y -loglevel error -i "$src" -an \
      -vf "setpts=${ratio}*PTS,${FIT}" -t "$secs" -c:v libx264 -preset medium -crf 20 "$out"
  else
    ffmpeg -y -loglevel error -i "$src" -an -vf "$FIT" -t "$secs" \
      -c:v libx264 -preset medium -crf 20 "$out"
  fi
}

from_still() {  # from_still <png> <seconds> <out>
  local frames
  frames=$(/usr/bin/python3 -c "print(int(round(30*$2)))")
  ffmpeg -y -loglevel error -loop 1 -i "$1" -r 30 \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},zoompan=z='min(zoom+0.0004,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,format=yuv420p" \
    -frames:v "$frames" -c:v libx264 -preset medium -crf 20 "$3"
}

echo "voice: $AUDIO_DIR"
: > "$WORK/v.txt"; : > "$WORK/a.txt"
missing=0

for spec in "${BEATS[@]}"; do
  set -- $spec
  id="$1"; aud="$2"; kind="$3"; shift 3; srcs=("$@")
  a=""
  for ext in wav mp3; do [ -f "$AUDIO_DIR/seg$aud.$ext" ] && a="$AUDIO_DIR/seg$aud.$ext"; done
  [ -n "$a" ] || { echo "  $id: MISSING audio seg$aud"; missing=$((missing+1)); continue; }
  d=$(dur "$a")

  case "$kind" in
    card)
      /usr/bin/python3 "$(dirname "$0")/make-cards.py" >/dev/null
      ffmpeg -y -loglevel error -loop 1 -i /tmp/kioskcards/end.png -t "$d" -r 30 \
        -vf "scale=${W}:${H},format=yuv420p" -c:v libx264 -preset medium -crf 20 "$WORK/$id.mp4" ;;
    still)
      [ -f "${srcs[0]}" ] || { echo "  $id: MISSING ${srcs[0]}"; missing=$((missing+1)); continue; }
      from_still "${srcs[0]}" "$d" "$WORK/$id.mp4" ;;
    stills)
      have=(); for s in "${srcs[@]}"; do [ -f "$s" ] && have+=("$s"); done
      [ "${#have[@]}" -gt 0 ] || { echo "  $id: MISSING all of ${srcs[*]}"; missing=$((missing+1)); continue; }
      per=$(/usr/bin/python3 -c "print($d/${#have[@]})")
      : > "$WORK/$id.list"; k=0
      for s in "${have[@]}"; do
        from_still "$s" "$per" "$WORK/$id-$k.mp4"; echo "file '$WORK/$id-$k.mp4'" >> "$WORK/$id.list"; k=$((k+1))
      done
      ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/$id.list" -c copy "$WORK/$id.mp4" ;;
    clip)
      [ -f "${srcs[0]}" ] || { echo "  $id: MISSING ${srcs[0]}"; missing=$((missing+1)); continue; }
      from_clip "${srcs[0]}" "$d" "$WORK/$id.mp4" ;;
  esac

  [ -f "$WORK/$id.mp4" ] || { echo "  $id: build failed"; missing=$((missing+1)); continue; }
  printf "  %-3s %-3s %-6s %ss  <- %s\n" "$id" "$aud" "$kind" "${d:0:5}" "$(basename "${srcs[0]:-endcard}")"
  echo "file '$WORK/$id.mp4'" >> "$WORK/v.txt"
  echo "file '$a'" >> "$WORK/a.txt"
done

echo "missing beats: $missing"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/v.txt" -c copy "$WORK/video.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/a.txt" -ar 44100 -ac 2 -c:a pcm_s16le "$WORK/voice.wav"
ffmpeg -y -loglevel error -i "$WORK/video.mp4" -i "$WORK/voice.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "done: $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
echo "silence check (gap >= 1.5s is a defect):"
ffmpeg -i "$OUT" -af silencedetect=noise=-35dB:d=1.5 -f null - 2>&1 | grep -i "silence_" || echo "  none"
