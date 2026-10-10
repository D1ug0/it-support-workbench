"""An actual isolated HTTP service. Commands are run manually in this container."""
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from control import STATE, reset
reset()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status, value = 200, {'ready': True}
        try:
            if not (STATE / 'available').exists():
                raise RuntimeError('dependency unavailable')
            config = json.loads((STATE / 'config.json').read_text())
            if os.environ.get('LAB_ROLE') == 'app':
                with urllib.request.urlopen('http://dependency:8080/ready', timeout=2) as response:
                    if response.status != 200:
                        raise RuntimeError('dependency not ready')
            value = {'ready': True, 'data': config}
        except Exception as error:
            status, value = 503, {'ready': False, 'error': type(error).__name__}
            print(f'Prepared lab diagnostic: {type(error).__name__}', flush=True)
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
