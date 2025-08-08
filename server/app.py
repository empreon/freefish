from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import chess

from main import ChessAI


class BestMoveRequest(BaseModel):
    fen: str = Field(..., description="FEN position to analyze")
    depth: Optional[int] = Field(None, description="Optional search depth override")


class BestMoveResponse(BaseModel):
    best_move_uci: str
    best_move_san: str
    new_fen: str


app = FastAPI(title="Freefish API", version="1.0.0")

# Allow local development origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize engine once; depth can be overridden per request
engine = ChessAI(depth=7, book_path='OpeningBook/kasparov.bin')


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/best-move", response_model=BestMoveResponse)
def best_move(payload: BestMoveRequest) -> BestMoveResponse:
    board = chess.Board(payload.fen)
    # Optional per-request depth override
    original_depth = engine.depth
    if payload.depth and payload.depth > 0:
        engine.depth = payload.depth

    move = engine.get_best_move(board)
    if move is None:
        # No legal moves (game over)
        return BestMoveResponse(
            best_move_uci="",
            best_move_san="",
            new_fen=board.fen(),
        )

    san = board.san(move)
    board.push(move)
    new_fen = board.fen()

    # restore depth
    engine.depth = original_depth

    return BestMoveResponse(
        best_move_uci=move.uci(),
        best_move_san=san,
        new_fen=new_fen,
    )


