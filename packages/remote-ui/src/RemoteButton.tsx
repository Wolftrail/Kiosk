import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type RemoteButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export const RemoteButton = forwardRef<HTMLButtonElement, RemoteButtonProps>(
  ({ type = 'button', ...props }, ref) => (
    <button {...props} ref={ref} type={type} data-remote-focus="" />
  ),
)

RemoteButton.displayName = 'RemoteButton'
