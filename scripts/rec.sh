#!/bin/zsh
# rec.sh NAME SECONDS   -> starts ffmpeg capture of the demo Brave window into /tmp/shots/NAME.mp4
NAME=$1
SECS=$2
CROP=${CROP:-2800:1600:20:80}
mkdir -p /tmp/shots
nohup ffmpeg -hide_banner -loglevel error -f avfoundation -capture_cursor 1 -framerate 30 -i "4:" \
  -t $SECS -vf "crop=$CROP" -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p \
  -y /tmp/shots/$NAME.mp4 </dev/null >/tmp/shots/$NAME.log 2>&1 &
echo $!
