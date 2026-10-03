import { RemoteButton } from './RemoteButton'

export type OnScreenKeyboardProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  maxLength?: number
  label?: string
}

const keyRows = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '.', '_'],
]

export function OnScreenKeyboard({
  value,
  onChange,
  disabled = false,
  maxLength,
  label = 'On-screen keyboard',
}: OnScreenKeyboardProps) {
  const append = (character: string) => {
    const nextValue = `${value}${character}`
    onChange(maxLength === undefined ? nextValue : nextValue.slice(0, maxLength))
  }

  return (
    <div className="remote-onscreen-keyboard" role="group" aria-label={label}>
      {keyRows.map((row, rowIndex) => (
        <div className="remote-onscreen-keyboard__row" key={rowIndex}>
          {row.map((key, keyIndex) => (
            <RemoteButton
              key={key}
              className="remote-onscreen-keyboard__key"
              aria-label={key}
              data-remote-initial={rowIndex === 0 && keyIndex === 0 ? '' : undefined}
              disabled={disabled || (maxLength !== undefined && value.length >= maxLength)}
              onClick={() => append(key)}
            >
              {key.toUpperCase()}
            </RemoteButton>
          ))}
          {rowIndex === 3 && (
            <RemoteButton
              className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--action"
              aria-label="Backspace"
              disabled={disabled || value.length === 0}
              onClick={() => onChange(value.slice(0, -1))}
            >
              Del
            </RemoteButton>
          )}
        </div>
      ))}
      <div className="remote-onscreen-keyboard__row remote-onscreen-keyboard__row--actions">
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--action"
          aria-label="Clear query"
          disabled={disabled || value.length === 0}
          onClick={() => onChange('')}
        >
          Clear
        </RemoteButton>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--space"
          aria-label="Space"
          disabled={disabled || (maxLength !== undefined && value.length >= maxLength)}
          onClick={() => append(' ')}
        >
          Space
        </RemoteButton>
      </div>
    </div>
  )
}