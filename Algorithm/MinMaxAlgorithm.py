from Evaluate.BoardEvaluation import evaluation

def moveSearch(board, depth, alpha, beta, turn):
    if depth == 0 or board.is_game_over():
        return evaluation(board)
    if turn:
        value = -9999
        for whiteMove in board.legal_moves:
            board.push(whiteMove)
            value = max(value, moveSearch(board, depth - 1, alpha, beta, False))
            alpha = max(alpha, value)
            board.pop()
            if alpha >= beta:
                break
        return value
    else:
        value = 9999
        for blackMove in board.legal_moves:
            board.push(blackMove)
            value = min(value, moveSearch(board, depth - 1, alpha, beta, True))
            beta = min(beta, value)
            board.pop()
            if beta <= alpha:
                break
        return value
