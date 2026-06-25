import asyncio, json, sys
from pathlib import Path
import numpy as np, websockets
sys.path.insert(0, str(Path(__file__).parent))
from corpora.buckeye import fetch
import secrets_local
def pcm16(a): return (np.clip(a,-1,1)*32767).astype("<i2").tobytes()
async def main():
    c = next(x for x in fetch(max_tracks=1) if x["is_complete"])
    pcm = pcm16(c["audio"]); key = secrets_local.deepgram()
    url=("wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16"
         "&sample_rate=16000&eot_threshold=0.5&eot_timeout_ms=9000")
    ws = await websockets.connect(url, additional_headers={"Authorization": f"Token {key}"}, max_size=None)
    async def send():
        for i in range(0,len(pcm),2560):
            await ws.send(pcm[i:i+2560]); await asyncio.sleep(0.03)
    st=asyncio.create_task(send())
    events=[]; last=None; max_conf=0.0
    try:
        while True:
            m=await asyncio.wait_for(ws.recv(),timeout=4.0)
            if isinstance(m,(bytes,bytearray)): continue
            d=json.loads(m); events.append(d.get("event")); last=d
            for k in d:
                if 'conf' in k.lower() and isinstance(d[k],(int,float)): max_conf=max(max_conf,d[k])
    except asyncio.TimeoutError: pass
    finally: st.cancel()
    print("events:", events)
    print("LAST keys:", list(last.keys()) if last else None)
    print("LAST full:", json.dumps({k:v for k,v in (last or {}).items() if k!='words'}))
    print("max conf-ish across run:", max_conf)
asyncio.run(main())
