import { profileDecorationAssetPath, type ProfileDecoration } from './profileDecorationData'

export function ProfileAvatarDecoration({ decoration }: { decoration: ProfileDecoration | null | undefined }) {
  if (!decoration || decoration.key === 'none') return null
  const assetPath = profileDecorationAssetPath(decoration.key)
  if (!assetPath) return null
  return (
    <span
      className={`avatar-decoration-layer has-generated-art ${decoration.cssClass} ${decoration.animated ? 'is-animated' : ''}`}
      aria-label={decoration.title}
    >
      <img
        src={assetPath}
        alt=""
        className="avatar-decoration-image"
        loading="lazy"
        decoding="async"
      />
      <span className="avatar-decoration-particle one" />
      <span className="avatar-decoration-particle two" />
    </span>
  )
}
