from Algorithm.MinMaxAlgorithm import moveSearch

import os
import sys
import time
import shutil
import signal
import subprocess
import webbrowser
from typing import Optional

import chess
import chess.polyglot


class ChessAI:
    def __init__(self, depth=3, book_path='OpeningBook/kasparov.bin'):
        self.depth = depth
        self.book = chess.polyglot.open_reader(book_path) if book_path else None

    def get_book_move(self, board):
        try:
            return self.book.weighted_choice(board).move
        except (IndexError, KeyError, AttributeError):
            return None

    def get_best_move(self, board):
        # Prefer opening book move when available
        book_move = self.get_book_move(board)
        if book_move is not None:
            return book_move

        search_depth = self.depth if isinstance(self.depth, int) and self.depth > 0 else 7
        selected_move = None
        best_value = -99999
        alpha = -100000
        beta = 100000

        for move in board.legal_moves:
            board.push(move)
            board_value = -moveSearch(board, search_depth - 1, -alpha, -beta, board.turn)
            if board_value > best_value:
                best_value = board_value
                selected_move = move
            if board_value > alpha:
                alpha = board_value
            board.pop()

        return selected_move


def _ensure_node_modules():
    web_dir = os.path.join(os.path.dirname(__file__), 'web')
    node_modules = os.path.join(web_dir, 'node_modules')
    if not os.path.isdir(web_dir):
        return None
    if not os.path.isdir(node_modules):
        npm = shutil.which('npm')
        if npm is None:
            print('Warning: npm not found. Frontend will not start. Install Node.js to enable the web UI.')
            return None
        print('Installing frontend dependencies (npm i)...')
        subprocess.run([npm, 'i'], cwd=web_dir, check=False)
    return web_dir


def run_backend(port: int = 8000) -> Optional[subprocess.Popen]:
    python_exe = sys.executable
    if not python_exe:
        return None
    print(f'Starting backend on http://localhost:{port} ...')
    proc = subprocess.Popen([python_exe, '-m', 'uvicorn', 'server.app:app', '--host', '0.0.0.0', '--port', str(port)])
    return proc


def run_frontend(port: int = 5173) -> Optional[subprocess.Popen]:
    web_dir = _ensure_node_modules()
    if web_dir is None:
        return None
    npm = shutil.which('npm')
    if npm is None:
        print('Warning: npm not found. Frontend will not start. Install Node.js to enable the web UI.')
        return None
    print(f'Starting frontend on http://localhost:{port} ...')
    env = os.environ.copy()
    # Ensure the app knows where the API is (defaults already to http://localhost:8000)
    env.setdefault('VITE_API_BASE', 'http://localhost:8000')
    proc = subprocess.Popen([npm, 'run', 'dev', '--silent', '--', '--port', str(port)], cwd=web_dir, env=env)
    return proc


def open_browser(url: str, retries: int = 20, delay: float = 0.5) -> None:
    # Best-effort open after a short delay for servers to boot
    for _ in range(retries):
        try:
            webbrowser.open(url)
            break
        except Exception:
            time.sleep(delay)


def main():
    backend_port = int(os.environ.get('FREEFISH_BACKEND_PORT', '8000'))
    frontend_port = int(os.environ.get('FREEFISH_FRONTEND_PORT', '5173'))

    backend_proc = run_backend(backend_port)
    # Give backend a moment to start
    time.sleep(1.0)

    frontend_proc = run_frontend(frontend_port)

    if frontend_proc:
        open_browser(f'http://localhost:{frontend_port}')
    elif backend_proc:
        print(f'Frontend did not start. You can still call the API at http://localhost:{backend_port}')

    try:
        # Wait on both; exit when user interrupts
        while True:
            time.sleep(1)
            if backend_proc and backend_proc.poll() is not None:
                print('Backend process exited. Stopping...')
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print('Frontend process exited. Stopping...')
                break
    except KeyboardInterrupt:
        print('Shutting down...')
    finally:
        for p in [frontend_proc, backend_proc]:
            if p and p.poll() is None:
                try:
                    if os.name == 'nt':
                        p.send_signal(signal.CTRL_BREAK_EVENT) if hasattr(signal, 'CTRL_BREAK_EVENT') else p.terminate()
                    else:
                        p.terminate()
                except Exception:
                    pass
        # Small grace period
        time.sleep(0.5)


if __name__ == '__main__':
    main()
