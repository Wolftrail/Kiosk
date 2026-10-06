import { RemoteLink } from '@kiosk/remote-ui'
import type { DeckImage } from './library'

export default function ImageCredit({ image }: { image: DeckImage }) {
  return <span className="image-credit">Photo by <RemoteLink href={image.photographerUrl} target="_blank" rel="noopener noreferrer">{image.photographer}</RemoteLink> on <RemoteLink href="https://unsplash.com/?utm_source=kiosk&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</RemoteLink></span>
}