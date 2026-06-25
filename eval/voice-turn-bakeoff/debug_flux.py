import asyncio, sys
from pathlib import Path
import numpy as np, websockets
sys.path.insert(0, str(Path(__file__).parent))
from corpora.buckeye import fetch
import secrets_local

def pcm16(a): return (np.clip(a,-1,1)*32767).astype("<i2").tobytes()

async def main():
    clips = fetch(max_tracks=1)
    c = next(x for x in clips if x["is_complete"])
    pcm = pcm16(c["audio"])
    print(f"clip {c['clip_id']} dur={len(c['audio'])/16000:.1f}s pcm={len(pcm)}B")
    key = secrets_local.deepgram()
    print("key len:", len(key) if key else None)
    url = ("wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16"
           "&sample_rate=16000&eot_threshold=0.5&eot_timeout_ms=9000")
    try:
        ws = await websockets.connect(url, additional_headers={"Authorization": f"Token {key}"}, max_size=None)
    except Exception as e:
        print("CONNECT ERROR:", repr(e)); return
    print("connected")
    async def send():
        for i in range(0,len(pcm),2560):
            await ws.send(pcm[i:i+2560]); await asyncio.sleep(0.03)
        print("sent all audio")
    st = asyncio.create_task(send())
    n=0
    try:
        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=4.0)
            n+=1
            if isinstance(msg,(bytes,bytearray)): print("BIN", len(msg)); continue
            print("MSG:", msg[:320])
    except asyncio.TimeoutError: print(f"idle timeout after {n} msgs")
    except Exception as e: print("RECV ERROR:", repr(e))
    finally: st.cancel()
asyncio.run(main())
