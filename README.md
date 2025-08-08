# Freefish

Freefish is a chess AI implementing minimax with alpha-beta pruning, piece-square evaluations, and opening book support. It ships with a modern React UI and a FastAPI backend.

Note: The core engine/algorithm was developed in 2021 while I was in high school. The React-based UI was added later.

## One-command run

PowerShell (Windows):
```
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; python main.py
```

This command will:
- Start the backend API at `http://localhost:8000`
- Install frontend deps (if missing) and start the web UI at `http://localhost:5173`
- Open your browser to the UI

If you already have a virtual environment active, you can simply run:
```
python main.py
```

## Features
- Minimax with alpha-beta pruning
- Piece-square table evaluation (`Evaluate/piece_sq_tables.npz`)
- Opening book (`OpeningBook/kasparov.bin`)
- React UI with move history, branching, theme settings, and engine hint arrows

## Project layout
- `server/` FastAPI app exposing `/best-move`
- `web/` Vite + React frontend (TypeScript)
- `Algorithm/`, `Evaluate/`, `Convert/` core engine and utilities
- `main.py` unified launcher that starts backend and frontend

## Settings & usage
- Change board colors and UI theme in the Settings panel (button in the Move History header)
- Click any move to jump there; making a different move creates a new branch
- Click Best Move to see a suggested arrow; Clear Hint to remove it

## Notes
- Requires Python 3.9+
- Node.js is optional but required for the web UI. If `npm` is not found, the backend API still runs.

## Customization
**NPZ Generator**
- Modify piece-square tables using `NPZGenerator.py`

**Opening Book**
- Replace `kasparov.bin` with alternative opening books
- Ensure binary opening books are in `/OpeningBooks` directory

## Project History
Originally developed in 2021 as a learning project for:
- Game theory algorithms
- Chess AI fundamentals
- Python optimization techniques

