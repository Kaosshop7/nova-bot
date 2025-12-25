import sys
import json
import subprocess

url = sys.argv[1]

cmd = [
    "yt-dlp",
    "-f", "bestaudio",
    "-g",
    "--no-playlist",
    url
]

try:
    stream_url = subprocess.check_output(cmd).decode().strip()

    info = subprocess.check_output([
        "yt-dlp",
        "--no-playlist",
        "--print", "%(title)s",
        url
    ]).decode().strip()

    result = {
        "status": "ok",
        "title": info,
        "stream": stream_url
    }

except Exception as e:
    result = {
        "status": "error",
        "error": str(e)
    }

print(json.dumps(result))
