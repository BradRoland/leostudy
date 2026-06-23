import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyConnect4Move,
  chooseConnect4BotMove,
  createConnect4State,
  findConnect4WinningCells,
  type Connect4State,
} from './connect4.ts'

const player1 = 'player-1'
const player2 = 'player-2'
const spectator = 'spectator-1'

function playColumns(columns: number[], state: Connect4State = createConnect4State()) {
  return columns.reduce((current, column, index) => {
    const userId = index % 2 === 0 ? player1 : player2
    return applyConnect4Move(current, column, userId, { player1UserId: player1, player2UserId: player2 }).state
  }, state)
}

test('initializes an empty 7 column by 6 row board with player 1 first', () => {
  const state = createConnect4State()

  assert.equal(state.board.length, 6)
  assert.equal(state.board.every((row) => row.length === 7), true)
  assert.deepEqual(state.board.flat(), Array.from({ length: 42 }, () => null))
  assert.equal(state.currentTurn, 'P1')
  assert.equal(state.winner, null)
  assert.equal(state.draw, false)
  assert.equal(state.status, 'active')
  assert.deepEqual(state.moveHistory, [])
})

test('drops a valid move to the bottom row and alternates turns', () => {
  const result = applyConnect4Move(createConnect4State(), 3, player1, { player1UserId: player1, player2UserId: player2 })

  assert.equal(result.state.board[5][3], 'P1')
  assert.equal(result.state.currentTurn, 'P2')
  assert.deepEqual(result.state.moveHistory, [{ player: 'P1', column: 3, row: 5 }])
})

test('stacks moves in the same column from bottom to top', () => {
  const state = playColumns([2, 2, 2])

  assert.equal(state.board[5][2], 'P1')
  assert.equal(state.board[4][2], 'P2')
  assert.equal(state.board[3][2], 'P1')
})

test('rejects a move in a full column', () => {
  const state = playColumns([0, 0, 0, 0, 0, 0])

  assert.throws(
    () => applyConnect4Move(state, 0, player1, { player1UserId: player1, player2UserId: player2 }),
    /Column is full/,
  )
})

test('rejects moves from the wrong player and spectators', () => {
  const state = createConnect4State()

  assert.throws(
    () => applyConnect4Move(state, 1, player2, { player1UserId: player1, player2UserId: player2 }),
    /Not your turn/,
  )
  assert.throws(
    () => applyConnect4Move(state, 1, spectator, { player1UserId: player1, player2UserId: player2 }),
    /Only players can move/,
  )
})

test('detects a horizontal win', () => {
  const state = playColumns([0, 0, 1, 1, 2, 2, 3])

  assert.equal(state.status, 'completed')
  assert.equal(state.winner, 'P1')
  assert.equal(state.winnerUserId, player1)
  assert.equal(state.draw, false)
  assert.deepEqual(findConnect4WinningCells(state.board, state.winner), [
    { row: 5, column: 0 },
    { row: 5, column: 1 },
    { row: 5, column: 2 },
    { row: 5, column: 3 },
  ])
})

test('detects a vertical win', () => {
  const state = playColumns([0, 1, 0, 1, 0, 1, 0])

  assert.equal(state.status, 'completed')
  assert.equal(state.winner, 'P1')
})

test('detects a diagonal down-right win', () => {
  const state = playColumns([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])

  assert.equal(state.status, 'completed')
  assert.equal(state.winner, 'P1')
  assert.deepEqual(findConnect4WinningCells(state.board, state.winner), [
    { row: 5, column: 0 },
    { row: 4, column: 1 },
    { row: 3, column: 2 },
    { row: 2, column: 3 },
  ])
})

test('detects a diagonal up-right win', () => {
  const state = playColumns([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0])

  assert.equal(state.status, 'completed')
  assert.equal(state.winner, 'P1')
})

test('detects a draw when the board is full without a winner', () => {
  const columns = [
    0, 1, 2, 3, 4, 5, 6,
    0, 1, 2, 3, 4, 5, 6,
    1, 0, 3, 2, 5, 4, 0,
    6, 2, 1, 4, 3, 6, 5,
    0, 1, 2, 3, 4, 5, 6,
    1, 0, 3, 2, 5, 4, 6,
  ]
  const state = playColumns(columns)

  assert.equal(state.status, 'completed')
  assert.equal(state.winner, null)
  assert.equal(state.draw, true)
})

test('rejects moves after game completion', () => {
  const state = playColumns([0, 0, 1, 1, 2, 2, 3])

  assert.throws(
    () => applyConnect4Move(state, 4, player2, { player1UserId: player1, player2UserId: player2 }),
    /Game is already completed/,
  )
})

test('bot prefers the center column on an empty board', () => {
  assert.equal(chooseConnect4BotMove(createConnect4State(), 'P2'), 3)
})

test('bot takes an immediate winning move', () => {
  const state = playColumns([0, 1, 0, 1, 2, 1, 3])

  assert.equal(chooseConnect4BotMove(state, 'P2'), 1)
})

test('bot blocks an immediate opponent win', () => {
  const state = playColumns([0, 6, 1, 6, 2])

  assert.equal(chooseConnect4BotMove(state, 'P2'), 3)
})

test('very-hard bot interrupts a simple four-column player plan', () => {
  let state = createConnect4State()
  const userPlan = [0, 1, 2, 3]

  for (const userColumn of userPlan) {
    state = applyConnect4Move(state, userColumn, player1, { player1UserId: player1, player2UserId: player2 }).state
    if (state.status === 'completed') break
    const botColumn = chooseConnect4BotMove(state, 'P2', 'very-hard')
    assert.equal(Number.isInteger(botColumn), true)
    state = applyConnect4Move(state, botColumn, player2, { player1UserId: player1, player2UserId: player2 }).state
  }

  assert.notEqual(state.winner, 'P1')
})

test('easy bot creates a centered three-disc threat when no one can win immediately', () => {
  const state: Connect4State = {
    ...createConnect4State(),
    currentTurn: 'P2',
    board: [
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      ['P2', 'P2', null, null, null, null, null],
    ],
  }

  assert.equal(chooseConnect4BotMove(state, 'P2', 'easy'), 3)
})

test('bot avoids giving the opponent a supported diagonal win', () => {
  const state: Connect4State = {
    ...createConnect4State(),
    currentTurn: 'P2',
    board: [
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, 'P1', null, null, null, null],
      [null, 'P1', 'P2', 'P2', null, null, null],
      ['P1', 'P2', 'P2', 'P2', null, null, null],
    ],
  }

  assert.notEqual(chooseConnect4BotMove(state, 'P2'), 3)
})

test('bot never chooses a full column', () => {
  const state = playColumns([3, 3, 3, 3, 3, 3])

  assert.notEqual(chooseConnect4BotMove(state, state.currentTurn), 3)
})

test('bot plays complete games without illegal moves', () => {
  for (const openingColumn of [0, 1, 2, 3, 4, 5, 6]) {
    let state = createConnect4State()
    let nextUserColumn = openingColumn

    while (state.status === 'active') {
      const legalUserColumns = state.board[0]
        .map((cell, column) => cell === null ? column : -1)
        .filter((column) => column >= 0)
      if (legalUserColumns.length === 0) break
      const userColumn = legalUserColumns.includes(nextUserColumn) ? nextUserColumn : legalUserColumns[0]
      state = applyConnect4Move(state, userColumn, player1, { player1UserId: player1, player2UserId: player2 }).state
      nextUserColumn = (nextUserColumn + 1) % 7
      if (state.status === 'completed') break

      const botColumn = chooseConnect4BotMove(state, 'P2')
      assert.equal(Number.isInteger(botColumn), true)
      assert.equal(botColumn >= 0 && botColumn < 7, true)
      assert.equal(state.board[0][botColumn], null)
      state = applyConnect4Move(state, botColumn, player2, { player1UserId: player1, player2UserId: player2 }).state
    }

    assert.equal(state.status, 'completed')
    assert.equal(state.moveHistory.length <= 42, true)
  }
})
