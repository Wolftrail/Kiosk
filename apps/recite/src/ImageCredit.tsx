import { RemoteLink } from '@kiosk/remote-ui'
import type { DeckImage } from './library'

export default function ImageCredit({ image, linked = true }: { image: DeckImage; linked?: boolean }) {
  if (!linked) return <span className="image-credit">Photo by {image.photographer} on Unsplash</span>
  return <span className="image-credit">Photo by <RemoteLink href={image.photographerUrl} target="_blank" rel="noopener noreferrer">{image.photographer}</RemoteLink> on <RemoteLink href="https://unsplash.com/?utm_source=kiosk&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</RemoteLink></span>
}