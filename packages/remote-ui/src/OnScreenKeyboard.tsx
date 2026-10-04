import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ArrowUp, CornerDownLeft, Delete, Globe, Space, Trash2 } from 'lucide-react'
import { RemoteButton } from './RemoteButton'
import { deleteKeyboardText, insertKeyboardText, keyboardLayouts, type KeyboardEdit, type KeyboardLanguage } from './keyboardLayouts'

export type OnScreenKeyboardProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  maxLength?: number
  label?: string
  inputRef?: RefObject<HTMLInputElement | null>
  onSubmit?: () => void
  submitLabel?: string
}

export function OnScreenKeyboard({
  value,
  onChange,
  disabled = false,
  maxLength,
  label = 'On-screen keyboard',
  inputRef,
  onSubmit,
  submitLabel = 'Done',
}: OnScreenKeyboardProps) {
  const [language, setLanguage] = useState<KeyboardLanguage>('en')
  const [shifted, setShifted] = useState(false)
  const pendingCaretRef = useRef<number | null>(null)
  const savedSelectionRef = useRef<{ value: string; start: number; end: number } | null>(null)
  const rows = keyboardLayouts[language].map((row) => Array.from(shifted ? row.shifted : row.normal))

  useEffect(() => {
    const input = inputRef?.current
    if (!input) return
    const rememberSelection = () => {
      savedSelectionRef.current = { value: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }
    }
    const rememberNativeSelection = () => {
      if (document.activeElement === input) rememberSelection()
    }
    input.addEventListener('blur', rememberSelection)
    input.addEventListener('select', rememberNativeSelection)
    return () => {
      input.removeEventListener('blur', rememberSelection)
      input.removeEventListener('select', rememberNativeSelection)
    }
  }, [inputRef])

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    pendingCaretRef.current = null
    const input = inputRef?.current
    if (caret !== null && input && input.selectionStart !== null) {
      const frame = requestAnimationFrame(() => {
        if (input.value === value) input.setSelectionRange(caret, caret)
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [value, inputRef])

  const selection = () => {
    const input = inputRef?.current
    const saved = savedSelectionRef.current
    if (saved?.value === value && document.activeElement !== input) return [saved.start, saved.end] as const
    return [input?.selectionStart ?? value.length, input?.selectionEnd ?? value.length] as const
  }

  const applyEdit = (edit: KeyboardEdit) => {
    if (edit.value === value) return
    pendingCaretRef.current = edit.caret
    savedSelectionRef.current = { value: edit.value, start: edit.caret, end: edit.caret }
    onChange(edit.value)
  }

  const insert = (text: string) => {
    const [start, end] = selection()
    applyEdit(insertKeyboardText(value, text, start, end, maxLength))
  }

  return (
    <div className="remote-onscreen-keyboard" role="group" aria-label={label} data-language={language}>
      {rows.map((row, rowIndex) => (
        <div className="remote-onscreen-keyboard__row" key={rowIndex}>
          {row.map((character, keyIndex) => (
            <RemoteButton
              key={keyIndex}
              className="remote-onscreen-keyboard__key"
              style={keyIndex === 0 ? { gridColumnStart: Math.floor((13 - row.length) / 2) + 1 } : undefined}
              aria-label={character}
              lang={language}
              data-key-position={`${rowIndex}:${keyIndex}`}
              data-remote-initial={rowIndex === 1 && keyIndex === 0 ? '' : undefined}
              disabled={disabled}
              onClick={() => insert(character)}
            >
              {/\p{Mark}/u.test(character) ? `\u25cc${character}` : character}
            </RemoteButton>
          ))}
        </div>
      ))}
      <div className="remote-onscreen-keyboard__row remote-onscreen-keyboard__row--actions" data-has-submit={Boolean(onSubmit)}>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--language"
          aria-label={`Switch to ${language === 'en' ? 'Thai' : 'English'} keyboard`}
          title={`Switch to ${language === 'en' ? 'Thai' : 'English'} keyboard`}
          disabled={disabled}
          onClick={() => { setLanguage(language === 'en' ? 'th' : 'en'); setShifted(false) }}
        ><Globe size={22} /><span lang={language}>{language === 'en' ? 'EN' : '\u0e44\u0e17\u0e22'}</span></RemoteButton>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--action"
          aria-label="Shift"
          aria-pressed={shifted}
          title="Shift"
          disabled={disabled}
          onClick={() => setShifted(!shifted)}
        ><ArrowUp size={25} /></RemoteButton>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--space"
          aria-label="Space"
          title="Space"
          disabled={disabled}
          onClick={() => insert(' ')}
        ><Space size={28} /></RemoteButton>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--action"
          aria-label="Backspace"
          title="Backspace"
          disabled={disabled}
          onClick={() => { const [start, end] = selection(); applyEdit(deleteKeyboardText(value, start, end)) }}
        ><Delete size={25} /></RemoteButton>
        <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--clear"
          aria-label="Clear text"
          title="Clear text"
          disabled={disabled}
          onClick={() => applyEdit({ value: '', caret: 0 })}
        ><Trash2 size={23} /></RemoteButton>
        {onSubmit && <RemoteButton
          className="remote-onscreen-keyboard__key remote-onscreen-keyboard__key--submit"
          aria-label={submitLabel}
          title={submitLabel}
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
        ><CornerDownLeft size={26} /></RemoteButton>}
      </div>
    </div>
  )
}