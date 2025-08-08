import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import axios from 'axios'

type MoveRecord = { san: string; uci: string; fen: string }

type NodeId = string
// Local typing for algebraic squares (a1..h8)
type Square = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`
type MoveNode = {
  id: NodeId
  parentId?: NodeId
  children: NodeId[]
  san?: string
  uci?: string
  fen: string
  ply: number
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

const THEMES: Record<string, { light: string; dark: string }> = {
  green: { light: '#eeeed2', dark: '#769656' },
  blue: { light: '#dee9f7', dark: '#4a6fa5' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  gray: { light: '#e5e7eb', dark: '#6b7280' },
  purple: { light: '#ede9fe', dark: '#7c3aed' },
}

function makeId(): NodeId {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function App() {
  const [game] = useState(() => new Chess())
  const [theme, setTheme] = useState<keyof typeof THEMES>('green')
  const [nodes, setNodes] = useState<Record<NodeId, MoveNode>>(() => {
    const root: MoveNode = { id: 'root', children: [], fen: new Chess().fen(), ply: 0 }
    return { [root.id]: root }
  })
  const [rootId] = useState<NodeId>('root')
  const [currentId, setCurrentId] = useState<NodeId>('root')
  const [position, setPosition] = useState(new Chess().fen())
  const [isLoading, setIsLoading] = useState(false)
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>('dark')
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [boardSize, setBoardSize] = useState<number>(Math.min(640, Math.floor(window.innerWidth * 0.55)))
  const [hintArrow, setHintArrow] = useState<[Square, Square] | null>(null)

  const currentNode = nodes[currentId]

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme)
  }, [uiTheme])

  useEffect(() => {
    const onResize = () => setBoardSize(Math.min(640, Math.floor(window.innerWidth * 0.55)))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setGameToFen = useCallback(
    (fen: string) => {
      game.load(fen)
      setPosition(fen)
    },
    [game]
  )

  const pathToCurrent = useMemo(() => {
    const stack: MoveNode[] = []
    let n: MoveNode | undefined = currentNode
    while (n) {
      stack.push(n)
      if (!n.parentId) break
      n = nodes[n.parentId]
    }
    return stack.reverse()
  }, [currentNode, nodes])

  const currentLine: MoveRecord[] = useMemo(() => {
    // exclude root node which has no move
    return pathToCurrent
      .slice(1)
      .map((n) => ({ san: n.san ?? '', uci: n.uci ?? '', fen: n.fen }))
  }, [pathToCurrent])

  const jumpToIndex = useCallback(
    (idx: number) => {
      // idx is move index in current line (0-based); map to node in pathToCurrent
      const targetNode = pathToCurrent[idx + 1] // +1 to skip root
      if (!targetNode) return
      setCurrentId(targetNode.id)
      setGameToFen(targetNode.fen)
      // Clear any existing hint when navigating
      setHintArrow(null)
    },
    [pathToCurrent, setGameToFen]
  )

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square) => {
      // Ensure the game state is at current node
      if (game.fen() !== position) {
        game.load(position)
      }
      const tried = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
      if (tried == null) return false

      const uci = tried.from + tried.to + (tried.promotion ?? '')
      const san = tried.san
      const newFen = game.fen()

      // User made a move; clear any previous hint arrow
      setHintArrow(null)

      let nextNodeId: NodeId | undefined
      let nextFen = newFen
      setNodes((prev) => {
        // Determine parent by current visible position (fen) to avoid any desyncs
        const parentByFen = Object.values(prev).find((n) => n.fen === position)
        const parent = parentByFen ?? prev[currentId]
        // Check if child with same UCI already exists
        const existingChild = parent.children
          .map((cid) => prev[cid])
          .find((c) => c?.uci === uci)
        if (existingChild) {
          nextNodeId = existingChild.id
          nextFen = existingChild.fen
          return prev
        }
        const newId = makeId()
        const newNode: MoveNode = { id: newId, parentId: parent.id, children: [], san, uci, fen: newFen, ply: parent.ply + 1 }
        nextNodeId = newId
        return {
          ...prev,
          [parent.id]: { ...parent, children: [...parent.children, newId] },
          [newId]: newNode,
        }
      })
      if (nextNodeId) {
        setCurrentId(nextNodeId)
        setPosition(nextFen)
      } else {
        setPosition(newFen)
      }
      return true
    },
    [game, position, currentId, nodes]
  )

  const resetGame = useCallback(() => {
    game.reset()
    const startFen = game.fen()
    setNodes({ root: { id: 'root', children: [], fen: startFen, ply: 0 } })
    setCurrentId('root')
    setPosition(startFen)
  }, [game])

  const askBestMove = useCallback(async () => {
    setIsLoading(true)
    try {
      // Use the current visible position to avoid desyncs
      if (game.fen() !== position) {
        game.load(position)
      }
      const res = await axios.post(`${API_BASE}/best-move`, { fen: position })
      const { best_move_uci: uci } = res.data as { best_move_uci: string; best_move_san: string; new_fen: string }
      // If no move (game over), clear hint
      if (!uci) { setHintArrow(null); return }
      const from = uci.slice(0, 2) as Square
      const to = uci.slice(2, 4) as Square
      // Show an arrow instead of playing the move
      setHintArrow([from, to])
    } finally {
      setIsLoading(false)
    }
  }, [game, position])

  const movePairs = useMemo(() => {
    const pairs: Array<[MoveRecord | undefined, MoveRecord | undefined]> = []
    for (let i = 0; i < currentLine.length; i += 2) {
      pairs.push([currentLine[i], currentLine[i + 1]])
    }
    return pairs
  }, [currentLine])

  const innerWidth = Math.max(280, boardSize - 32)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `minmax(320px, ${boardSize}px) 380px`, alignItems: 'start', gap: 16, width: 'min(1200px, 96vw)' }}>
      <div style={{ background: 'var(--panel)', padding: 16, borderRadius: 12 }}>
        <Chessboard
          id="freefish-board"
          position={position}
          onPieceDrop={onDrop}
          boardWidth={innerWidth}
          customDarkSquareStyle={{ backgroundColor: THEMES[theme].dark }}
          customLightSquareStyle={{ backgroundColor: THEMES[theme].light }}
          animationDuration={150}
          areArrowsAllowed={true}
          customArrows={hintArrow ? [hintArrow] : []}
          customArrowColor={'rgba(255, 166, 0, 0.85)'}
        />
        <div style={{ width: innerWidth, marginTop: 12, background: 'var(--panel-weak)', borderRadius: 10, padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>FEN</div>
          <div style={{ userSelect: 'all', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{position}</div>
          <button onClick={() => navigator.clipboard?.writeText(position)} style={{ marginLeft: 'auto', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'var(--btn)', color: 'var(--btn-text)' }}>Copy</button>
        </div>
        <div style={{ width: innerWidth, display: 'flex', gap: 14, marginTop: 12, boxSizing: 'border-box' }}>
          <button onClick={resetGame} style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--btn)', color: 'var(--btn-text)', border: 'none' }}>Reset</button>
          <button onClick={askBestMove} disabled={isLoading} style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--accent)', color: '#0b1021', border: 'none' }}>
            {isLoading ? 'Thinking…' : 'Best Move'}
          </button>
          {hintArrow && (
            <button onClick={() => setHintArrow(null)} style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--btn)', color: 'var(--btn-text)', border: 'none' }}>Clear Hint</button>
          )}
        </div>
      </div>
      <div style={{ background: 'var(--panel)', padding: 16, borderRadius: 12, height: 'min(80vh, 720px)', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Move History</h3>
          <button onClick={() => setShowSettings((v) => !v)} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--btn)', color: 'var(--btn-text)', border: 'none' }}>Settings</button>
        </div>
        {showSettings && (
          <div style={{ display: 'grid', gap: 12, margin: '12px 0 8px 0' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Board Theme</div>
              <select value={theme} onChange={(e) => setTheme(e.target.value as any)} style={{ width: '100%', padding: 8, borderRadius: 8 }}>
                {Object.keys(THEMES).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>UI Theme</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setUiTheme('dark')} style={{ padding: '6px 10px', borderRadius: 8, background: uiTheme === 'dark' ? 'var(--accent)' : 'var(--btn)', color: uiTheme === 'dark' ? '#0b1021' : 'var(--btn-text)', border: 'none' }}>Dark</button>
                <button onClick={() => setUiTheme('light')} style={{ padding: '6px 10px', borderRadius: 8, background: uiTheme === 'light' ? 'var(--accent)' : 'var(--btn)', color: uiTheme === 'light' ? '#0b1021' : 'var(--btn-text)', border: 'none' }}>Light</button>
              </div>
            </div>
          </div>
        )}
        <h3 style={{ marginTop: 16 }}>Moves</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>White</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Black</th>
            </tr>
          </thead>
          <tbody>
            {movePairs.map((pair, idx) => {
              const whiteIdx = idx * 2
              const blackIdx = idx * 2 + 1
              const cellStyle: React.CSSProperties = { padding: '4px 6px', cursor: 'pointer', borderRadius: 4 }
              const currentMoveIdx = Math.max(-1, pathToCurrent.length - 2)
              const isWhiteActive = whiteIdx === currentMoveIdx
              const isBlackActive = blackIdx === currentMoveIdx
              return (
                <tr key={idx}>
                  <td style={{ padding: '4px 6px', opacity: 0.8 }}>{idx + 1}</td>
                  <td
                    onClick={() => pair[0] && jumpToIndex(whiteIdx)}
                    style={{ ...cellStyle, outline: isWhiteActive ? '2px solid var(--accent)' : undefined }}
                    title="Jump to this position"
                  >
                    {pair[0]?.san ?? ''}
                  </td>
                  <td
                    onClick={() => pair[1] && jumpToIndex(blackIdx)}
                    style={{ ...cellStyle, outline: isBlackActive ? '2px solid var(--accent)' : undefined }}
                    title="Jump to this position"
                  >
                    {pair[1]?.san ?? ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>Tip: Click any move to jump there. Making a different move creates a new branch.</div>
      </div>
    </div>
  )
}


