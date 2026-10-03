import { forwardRef, type AnchorHTMLAttributes } from 'react'

export type RemoteLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>

export const RemoteLink = forwardRef<HTMLAnchorElement, RemoteLinkProps>(
  (props, ref) => <a {...props} ref={ref} data-remote-focus="" />,
)

RemoteLink.displayName = 'RemoteLink'
