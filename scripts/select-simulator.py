import json
import subprocess
import sys
import re
from pathlib import Path

devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))['devices']
kind = sys.argv[1] if len(sys.argv) > 1 else 'iPad'
ordered = sorted(devices.items(), key=lambda item: tuple(int(n) for n in re.findall(r'\d+', item[0])), reverse=True)
candidates = [d for runtime, group in ordered if 'iOS' in runtime for d in group if d.get('isAvailable') and kind in d['name']]
if not candidates: raise SystemExit(f'No available {kind} simulator.')
chosen = candidates[0]
Path('simulator-id.txt').write_text(chosen['udid'])
print(f"Using {chosen['name']} ({chosen['udid']})")
if chosen.get('state') != 'Booted': subprocess.run(['xcrun', 'simctl', 'boot', chosen['udid']], check=True)
subprocess.run(['xcrun', 'simctl', 'bootstatus', chosen['udid'], '-b'], check=True)
