import json
import subprocess
from pathlib import Path

devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))['devices']
candidates = [d for runtime, group in devices.items() if 'iOS' in runtime for d in group if d.get('isAvailable') and 'iPad' in d['name']]
if not candidates: raise SystemExit('No available iPad simulator.')
chosen = candidates[0]
Path('simulator-id.txt').write_text(chosen['udid'])
print(f"Using {chosen['name']} ({chosen['udid']})")
