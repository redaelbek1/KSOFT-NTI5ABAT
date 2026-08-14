import json
import time
import urllib.request

payloads = [
    {"election": "legislative_2021", "region": 0, "province": 0, "commune": 0, "circ": 0},
    {"election": "legislative_2021", "region": 1, "province": 22, "commune": 0, "circ": 15},
]

for data in payloads:
    t0 = time.time()
    req = urllib.request.Request(
        "http://127.0.0.1:10000/api/preview",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode())
    ms = int((time.time() - t0) * 1000)
    print(f"count={body.get('count')} ms={ms} sel={data}")
