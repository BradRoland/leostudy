export type Connect4Cell = 'P1' | 'P2' | null
export type Connect4Player = Exclude<Connect4Cell, null>
export type Connect4Status = 'active' | 'completed'

export type Connect4Move = {
  player: Connect4Player
  column: number
  row: number
}

export type Connect4Coordinate = {
  row: number
  column: number
}

export type Connect4State = {
  board: Connect4Cell[][]
  currentTurn: Connect4Player
  winner: Connect4Player | null
  winnerUserId: string | null
  draw: boolean
  status: Connect4Status
  moveHistory: Connect4Move[]
}

export type Connect4Players = {
  player1UserId: string
  player2UserId: string
}

export type Connect4MoveResult = {
  state: Connect4State
  placed: Connect4Move
}

export const connect4Rows = 6
export const connect4Columns = 7

export function createConnect4State(): Connect4State {
  return {
    board: Array.from({ length: connect4Rows }, () => Array.from({ length: connect4Columns }, () => null)),
    currentTurn: 'P1',
    winner: null,
    winnerUserId: null,
    draw: false,
    status: 'active',
    moveHistory: [],
  }
}

function cloneBoard(board: Connect4Cell[][]) {
  return Array.from({ length: connect4Rows }, (_unused, rowIndex) => (
    Array.from({ length: connect4Columns }, (_unusedCell, columnIndex) => {
      const value = board[rowIndex]?.[columnIndex]
      return value === 'P1' || value === 'P2' ? value : null
    })
  ))
}

function playerForUser(userId: string, players: Connect4Players): Connect4Player {
  if (userId && userId === players.player1UserId) return 'P1'
  if (userId && userId === players.player2UserId) return 'P2'
  throw new Error('Only players can move')
}

function nextPlayer(player: Connect4Player): Connect4Player {
  return player === 'P1' ? 'P2' : 'P1'
}

function findDropRow(board: Connect4Cell[][], column: number) {
  for (let row = connect4Rows - 1; row >= 0; row -= 1) {
    if (board[row][column] === null) return row
  }
  return -1
}

function countDirection(board: Connect4Cell[][], row: number, column: number, rowStep: number, columnStep: number, player: Connect4Player) {
  let count = 0
  let nextRow = row + rowStep
  let nextColumn = column + columnStep
  while (
    nextRow >= 0
    && nextRow < connect4Rows
    && nextColumn >= 0
    && nextColumn < connect4Columns
    && board[nextRow][nextColumn] === player
  ) {
    count += 1
    nextRow += rowStep
    nextColumn += columnStep
  }
  return count
}

function hasConnect4Win(board: Connect4Cell[][], row: number, column: number, player: Connect4Player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ] as const

  return directions.some(([rowStep, columnStep]) => (
    1
    + countDirection(board, row, column, rowStep, columnStep, player)
    + countDirection(board, row, column, -rowStep, -columnStep, player)
    >= 4
  ))
}

export function findConnect4WinningCells(board: Connect4Cell[][], player: Connect4Player | null): Connect4Coordinate[] {
  if (!player) return []
  const normalizedBoard = cloneBoard(board)
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ] as const

  for (let row = 0; row < connect4Rows; row += 1) {
    for (let column = 0; column < connect4Columns; column += 1) {
      if (normalizedBoard[row][column] !== player) continue
      for (const [rowStep, columnStep] of directions) {
        const cells = Array.from({ length: 4 }, (_unused, index) => ({
          row: row + rowStep * index,
          column: column + columnStep * index,
        }))
        if (cells.every((cell) => (
          cell.row >= 0
          && cell.row < connect4Rows
          && cell.column >= 0
          && cell.column < connect4Columns
          && normalizedBoard[cell.row][cell.column] === player
        ))) {
          return cells
        }
      }
    }
  }

  return []
}

function boardIsFull(board: Connect4Cell[][]) {
  return board.every((row) => row.every((cell) => cell !== null))
}

function legalColumns(board: Connect4Cell[][]) {
  return Array.from({ length: connect4Columns }, (_unused, column) => column)
    .filter((column) => board[0][column] === null)
}

function wouldWin(board: Connect4Cell[][], column: number, player: Connect4Player) {
  const nextBoard = cloneBoard(board)
  const row = findDropRow(nextBoard, column)
  if (row < 0) return false
  nextBoard[row][column] = player
  return hasConnect4Win(nextBoard, row, column, player)
}

function simulateDrop(board: Connect4Cell[][], column: number, player: Connect4Player) {
  const nextBoard = cloneBoard(board)
  const row = findDropRow(nextBoard, column)
  if (row < 0) return null
  nextBoard[row][column] = player
  return { board: nextBoard, row }
}

function scoreWindow(window: Connect4Cell[], player: Connect4Player) {
  const opponent = player === 'P1' ? 'P2' : 'P1'
  const ownCount = window.filter((cell) => cell === player).length
  const opponentCount = window.filter((cell) => cell === opponent).length
  const emptyCount = window.filter((cell) => cell === null).length

  if (ownCount > 0 && opponentCount > 0) return 0
  if (ownCount === 3 && emptyCount === 1) return 120
  if (ownCount === 2 && emptyCount === 2) return 20
  if (ownCount === 1 && emptyCount === 3) return 3
  if (opponentCount === 3 && emptyCount === 1) return 95
  if (opponentCount === 2 && emptyCount === 2) return 12
  return 0
}

function boardWindows(board: Connect4Cell[][]) {
  const windows: Connect4Cell[][] = []

  for (let row = 0; row < connect4Rows; row += 1) {
    for (let column = 0; column <= connect4Columns - 4; column += 1) {
      windows.push([board[row][column], board[row][column + 1], board[row][column + 2], board[row][column + 3]])
    }
  }

  for (let column = 0; column < connect4Columns; column += 1) {
    for (let row = 0; row <= connect4Rows - 4; row += 1) {
      windows.push([board[row][column], board[row + 1][column], board[row + 2][column], board[row + 3][column]])
    }
  }

  for (let row = 0; row <= connect4Rows - 4; row += 1) {
    for (let column = 0; column <= connect4Columns - 4; column += 1) {
      windows.push([board[row][column], board[row + 1][column + 1], board[row + 2][column + 2], board[row + 3][column + 3]])
    }
  }

  for (let row = 3; row < connect4Rows; row += 1) {
    for (let column = 0; column <= connect4Columns - 4; column += 1) {
      windows.push([board[row][column], board[row - 1][column + 1], board[row - 2][column + 2], board[row - 3][column + 3]])
    }
  }

  return windows
}

function countImmediateWins(board: Connect4Cell[][], player: Connect4Player) {
  return legalColumns(board).filter((column) => wouldWin(board, column, player)).length
}

function scoreBoardForPlayer(board: Connect4Cell[][], player: Connect4Player) {
  let score = 0
  for (let row = 0; row < connect4Rows; row += 1) {
    if (board[row][3] === player) score += 7
  }
  for (const window of boardWindows(board)) {
    score += scoreWindow(window, player)
  }
  return score
}

export function normalizeConnect4State(value: Partial<Connect4State> | null | undefined): Connect4State {
  const fallback = createConnect4State()
  if (!value || typeof value !== 'object') return fallback
  const board = Array.isArray(value.board) ? cloneBoard(value.board) : fallback.board
  const currentTurn = value.currentTurn === 'P2' ? 'P2' : 'P1'
  const winner = value.winner === 'P1' || value.winner === 'P2' ? value.winner : null
  const draw = Boolean(value.draw)
  const status = value.status === 'completed' || winner || draw ? 'completed' : 'active'
  const moveHistory = Array.isArray(value.moveHistory)
    ? value.moveHistory.flatMap((move) => {
      if (!move || typeof move !== 'object') return []
      const player = move.player === 'P1' || move.player === 'P2' ? move.player : null
      const column = Number(move.column)
      const row = Number(move.row)
      if (!player || !Number.isInteger(column) || !Number.isInteger(row)) return []
      if (column < 0 || column >= connect4Columns || row < 0 || row >= connect4Rows) return []
      return [{ player, column, row }]
    })
    : []

  return {
    board,
    currentTurn,
    winner,
    winnerUserId: typeof value.winnerUserId === 'string' && value.winnerUserId ? value.winnerUserId : null,
    draw,
    status,
    moveHistory,
  }
}

export function chooseConnect4BotMove(sourceState: Connect4State, botPlayer: Connect4Player): number {
  const state = normalizeConnect4State(sourceState)
  const columns = legalColumns(state.board)
  if (columns.length === 0) return -1
  const opponent = botPlayer === 'P1' ? 'P2' : 'P1'
  const centerBiasedColumns = [...columns].sort((left, right) => Math.abs(left - 3) - Math.abs(right - 3))

  const winningColumn = centerBiasedColumns.find((column) => wouldWin(state.board, column, botPlayer))
  if (typeof winningColumn === 'number') return winningColumn

  const blockingColumn = centerBiasedColumns.find((column) => wouldWin(state.board, column, opponent))
  if (typeof blockingColumn === 'number') return blockingColumn

  const scoredColumns = centerBiasedColumns.map((column) => {
    const simulated = simulateDrop(state.board, column, botPlayer)
    if (!simulated) return { column, score: Number.NEGATIVE_INFINITY }

    const opponentImmediateWins = countImmediateWins(simulated.board, opponent)
    const botImmediateWins = countImmediateWins(simulated.board, botPlayer)
    const rowDepthBonus = simulated.row * 0.4
    const centerBonus = 8 - Math.abs(column - 3) * 2
    const score = scoreBoardForPlayer(simulated.board, botPlayer)
      + botImmediateWins * 70
      + centerBonus
      + rowDepthBonus
      - opponentImmediateWins * 1000

    return { column, score }
  })

  scoredColumns.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return Math.abs(left.column - 3) - Math.abs(right.column - 3)
  })

  return scoredColumns[0]?.column ?? centerBiasedColumns[0]
}

export function applyConnect4Move(
  sourceState: Connect4State,
  column: number,
  userId: string,
  players: Connect4Players,
): Connect4MoveResult {
  const state = normalizeConnect4State(sourceState)
  if (state.status === 'completed') {
    throw new Error('Game is already completed')
  }
  const player = playerForUser(userId, players)
  if (player !== state.currentTurn) {
    throw new Error('Not your turn')
  }
  if (!Number.isInteger(column) || column < 0 || column >= connect4Columns) {
    throw new Error('Column must be between 0 and 6')
  }

  const board = cloneBoard(state.board)
  const row = findDropRow(board, column)
  if (row < 0) {
    throw new Error('Column is full')
  }

  board[row][column] = player
  const placed = { player, column, row }
  const winner = hasConnect4Win(board, row, column, player) ? player : null
  const draw = !winner && boardIsFull(board)
  const status = winner || draw ? 'completed' : 'active'
  const winnerUserId = winner === 'P1'
    ? players.player1UserId
    : winner === 'P2'
      ? players.player2UserId
      : null

  return {
    placed,
    state: {
      board,
      currentTurn: status === 'completed' ? player : nextPlayer(player),
      winner,
      winnerUserId,
      draw,
      status,
      moveHistory: [...state.moveHistory, placed],
    },
  }
}
