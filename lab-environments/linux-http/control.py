"""Only synthetic files in /state are changed. No shell or host mounts."""
import json
import sys
from pathlib import Path
STATE = Path('/state')
def reset():
    STATE.mkdir(exist_ok=True)
    if (STATE / 'config.json').exists():
        (STATE / 'config.json').chmod(0o640)
    (STATE / 'config.json').write_text(json.dumps({'message': '12 synthetic tickets', 'revision': 1}))
    (STATE / 'config.json').chmod(0o640)
    (STATE / 'available').write_text('ready')
if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else ''
    if action == 'reset':
        reset()
    elif action == 'break-permissions':
        (STATE / 'config.json').chmod(0o000)
    elif action == 'fix-permissions':
        (STATE / 'config.json').chmod(0o640)
    elif action == 'break-dependency':
        (STATE / 'available').unlink(missing_ok=True)
    elif action == 'fix-dependency':
        (STATE / 'available').write_text('ready')
    else:
        sys.exit('Allowed: reset, break-permissions, fix-permissions, break-dependency, fix-dependency')
