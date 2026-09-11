#!/usr/bin/env bash
# Assemble the Kiosk demo video from captured stills and rendered narration.
#
# Every frame is the real deployed product against live Shannon markets. The widget
# segment is played at the rate it was captured, one frame every 1.1 seconds, so the
# countdown ticking on screen is real elapsed time and not an animation.
set -euo pipefail

STILLS=/tmp/kioskstills
AUDIO=/tmp/kioskaudio
WORK=/tmp/kioskvideo
OUT="${1:-/tmp/kiosk-demo.mp4}"
W=1920
H=1080

rm -rf "$WORK"; mkdir -p "$WORK"

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# Ken Burns over a set of stills, stretched to exactly match its narration segment.
# ffmpeg's glob does not handle bracket ranges, so each segment's frames are staged
# into their own directory under sequential names first.
stage() {  # stage <id> <shell-glob> -> echoes the staging dir
  local id="$1"; shift
  local dir="$WORK/stage-$id"
  rm -rf "$dir"; mkdir -p "$dir"
  local k=0
  for f in $@; do
    [ -f "$f" ] || continue
    cp "$f" "$(printf '%s/s%04d.png' "$dir" "$k")"
    k=$((k+1))
  done
  echo "$dir"
}

kenburns() {  # kenburns <stagedir> <seconds> <out>
  local dir="$1" secs="$2" out="$3"
  local glob="$dir/s*.png"
  local n frames each
  n=$(ls $glob 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] || { echo "no stills in $dir"; return 1; }
  frames=$(/usr/bin/python3 -c "print(int(round(30*$secs)))")
  each=$(/usr/bin/python3 -c "print(max(1,int(round($frames/$n))))")
  ffmpeg -y -loglevel error \
    -framerate 30 -pattern_type glob -i "$glob" \
    -vf "scale=${W}:-2:flags=lanczos,crop=${W}:${H}:0:0,zoompan=z='min(zoom+0.0004,1.10)':d=${each}:x='iw/2-(iw/zoom/2)':y='0':s=${W}x${H}:fps=30,format=yuv420p" \
    -frames:v "$frames" -c:v libx264 -preset medium -crf 19 "$out"
}

# The widget, replayed at capture cadence so the countdown is genuine elapsed time.
realtime() {  # realtime <stagedir> <seconds> <out>
  local dir="$1" secs="$2" out="$3"
  local glob="$dir/s*.png"
  local frames
  frames=$(/usr/bin/python3 -c "print(int(round(30*$secs)))")
  ffmpeg -y -loglevel error \
    -framerate 0.95 -pattern_type glob -i "$glob" \
    -vf "scale=${W}:-2:flags=lanczos,crop=${W}:${H}:0:0,fps=30,format=yuv420p" \
    -frames:v "$frames" -c:v libx264 -preset medium -crf 19 "$out"
}

echo "building segments"
i=0
for spec in \
  "01:$STILLS/landing-0[0-2].png:kb" \
  "02:$STILLS/landing-0[3-5].png:kb" \
  "03:$STILLS/host-0*.png:kb" \
  "04:$STILLS/widget-*.png:rt" \
  "05:$STILLS/dash-0*.png:kb" \
  "06:$STILLS/landing-0[6-9].png:kb" ; do
  id="${spec%%:*}"; rest="${spec#*:}"; glob="${rest%%:*}"; mode="${rest##*:}"
  a="$AUDIO/seg$id.mp3"
  [ -f "$a" ] || { echo "missing $a"; exit 1; }
  d=$(dur "$a")
  echo "  seg$id  ${d}s  $mode"
  sdir=$(stage "$id" $glob)
  if [ "$mode" = "rt" ]; then
    realtime "$sdir" "$d" "$WORK/v$id.mp4"
  else
    kenburns "$sdir" "$d" "$WORK/v$id.mp4"
  fi
  i=$((i+1))
done

echo "concatenating"
: > "$WORK/vlist.txt"; : > "$WORK/alist.txt"
for id in 01 02 03 04 05 06; do
  echo "file '$WORK/v$id.mp4'" >> "$WORK/vlist.txt"
  echo "file '$AUDIO/seg$id.mp3'" >> "$WORK/alist.txt"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/vlist.txt" -c copy "$WORK/video.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/alist.txt" -ar 44100 -ac 2 -c:a pcm_s16le "$WORK/voice.wav"

echo "cards"
# This ffmpeg has no drawtext filter, so the cards are pre-rendered by make-cards.py.
/usr/bin/python3 "$(dirname "$0")/make-cards.py" >/dev/null
still_to_clip() {  # still_to_clip <png> <seconds> <out>
  ffmpeg -y -loglevel error -loop 1 -i "$1" -t "$2" -r 30 \
    -vf "scale=${W}:${H},format=yuv420p" -c:v libx264 -preset medium -crf 19 "$3"
}
still_to_clip /tmp/kioskcards/title.png 4 "$WORK/title.mp4"
still_to_clip /tmp/kioskcards/end.png 9 "$WORK/end.mp4"

# Pad the narration with the silence the cards occupy so picture and voice stay locked.
ffmpeg -y -loglevel error -f lavfi -i "anullsrc=r=44100:cl=stereo:d=4" -c:a pcm_s16le "$WORK/pre.wav"
ffmpeg -y -loglevel error -f lavfi -i "anullsrc=r=44100:cl=stereo:d=9" -c:a pcm_s16le "$WORK/post.wav"
printf "file '%s'\n" "$WORK/pre.wav" "$WORK/voice.wav" "$WORK/post.wav" > "$WORK/afinal.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/afinal.txt" -c:a pcm_s16le "$WORK/final.wav"

printf "file '%s'\n" "$WORK/title.mp4" > "$WORK/vfinal.txt"
cat "$WORK/vlist.txt" >> "$WORK/vfinal.txt"
printf "file '%s'\n" "$WORK/end.mp4" >> "$WORK/vfinal.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/vfinal.txt" -c copy "$WORK/video-final.mp4"

echo "muxing"
ffmpeg -y -loglevel error -i "$WORK/video-final.mp4" -i "$WORK/final.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "done: $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
