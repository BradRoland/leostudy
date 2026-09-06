import { AcademyIcon, type AcademyIconName } from './AcademyIcon'

export type AcademyGamePath = '/games/matching' | '/games/speed' | '/games/blaster' | '/games/duel'

const games: { path: AcademyGamePath; name: string; icon: AcademyIconName; category: string; description: string; format: string }[] = [
  { path: '/games/matching', name: 'Matching', icon: 'flashcards', category: 'Build recall', description: 'Connect each code with its definition and make the knowledge stick.', format: 'Solo · Quick rounds' },
  { path: '/games/speed', name: 'Speed Test', icon: 'speed', category: 'Think faster', description: 'Find the right answer under a running clock. Accuracy comes first.', format: 'Solo · Timed practice' },
  { path: '/games/blaster', name: 'Code Blaster', icon: 'blaster', category: 'Stay sharp', description: 'Spot the right code while staying in motion through the playfield.', format: 'Solo · Action' },
  { path: '/games/duel', name: '1v1', icon: 'duel', category: 'Practice together', description: 'Challenge a classmate or practice against a bot at your own pace.', format: 'Head-to-head · Practice' },
]

export function AcademyGamesHub({ onOpenGame }: { onOpenGame: (path: AcademyGamePath) => void }) {
  return (
    <div className="academy-games-hub">
      <header className="academy-workspace-heading academy-games-heading">
        <div>
          <p className="eyebrow">Your training ground</p>
          <h2>A little challenge. A stronger recall.</h2>
          <p>Choose a way to practice, then see how you compare with your class.</p>
        </div>
        <span className="academy-workspace-emblem"><AcademyIcon name="games" /></span>
      </header>
      <div className="games-hub-grid academy-game-launch-grid">
        {games.map((game) => (
          <button key={game.path} type="button" className="card games-hub-game-card academy-game-card" onClick={() => onOpenGame(game.path)}>
            <span className="academy-game-topline">
              <span className="academy-game-icon"><AcademyIcon name={game.icon} /></span>
              <span className="academy-game-category">{game.category}</span>
              <AcademyIcon name="arrow" className="academy-game-arrow" />
            </span>
            <span className="academy-game-copy">
              <strong>{game.name}</strong>
              <span>{game.description}</span>
            </span>
            <span className="academy-game-format">{game.format}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
