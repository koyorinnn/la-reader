import json
import subprocess
import sys
from pathlib import Path

devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))['devices']
kind = sys.argv[1] if len(sys.argv) > 1 else 'iPad'
candidates = [d for runtime, group in devices.items() if 'iOS' in runtime for d in group if d.get('isAvailable') and kind in d['name']]
if not candidates: raise SystemExit(f'No available {kind} simulator.')
chosen = candidates[0]
Path('simulator-id.txt').write_text(chosen['udid'])
print(f"Using {chosen['name']} ({chosen['udid']})")
