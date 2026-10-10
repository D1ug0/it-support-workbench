"""Only synthetic files in /state are changed. No shell or host mounts."""
import json
import sys
from pathlib import Path

STATE = Path('/state')


def write_config(value):
    if (STATE / 'config.json').exists():
        (STATE / 'config.json').chmod(0o640)
    (STATE / 'config.json').write_text(json.dumps(value))
    (STATE / 'config.json').chmod(0o640)


def reset():
    STATE.mkdir(exist_ok=True)
    write_config({'message': '12 synthetic tickets', 'revision': 1})
    (STATE / 'available').write_text('ready')


def restore(text):
    if len(text.encode('utf-8')) > 4096:
        raise ValueError('Backup exceeds 4096 bytes')
    value = json.loads(text)
    if (not isinstance(value, dict) or set(value) != {'message', 'revision'}
            or value['message'] != '12 synthetic tickets'
            or type(value['revision']) is not int or value['revision'] != 1):
        raise ValueError('Only the known synthetic v1 backup is allowed')
    write_config(value)


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else ''
    if action == 'reset':
        reset()
    elif action == 'restore':
        restore(sys.stdin.read(4097))
    elif action == 'break-permissions':
        (STATE / 'config.json').chmod(0o000)
    elif action == 'break-content':
        write_config({'message': 'damaged synthetic tickets', 'revision': 2})
    elif action == 'fix-permissions':
        (STATE / 'config.json').chmod(0o640)
    elif action == 'break-dependency':
        (STATE / 'available').unlink(missing_ok=True)
    elif action == 'fix-dependency':
        (STATE / 'available').write_text('ready')
    else:
        sys.exit('Allowed: reset, restore, break-content, break-permissions, fix-permissions, break-dependency, fix-dependency')
