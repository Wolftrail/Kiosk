import {
  BookOpen,
  Layers,
  Dumbbell,
  Music2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type KioskApp = {
  id: string
  name: string
  description: string
  category: string
  icon: LucideIcon
  tone: 'coral' | 'green' | 'blue' | 'yellow'
  projectPath: string
  url?: string
}

export const appCatalog: KioskApp[] = [
  {
    id: 'recite',
    name: 'Recite',
    description: 'Train your memory with flashcard decks.',
    category: 'Learning',
    icon: Layers,
    tone: 'yellow',
    projectPath: 'apps/recite',
    url: '/apps/recite/',
  },
  {
    id: 'jukebox',
    name: 'Jukebox',
    description: 'Browse and play music videos together.',
    category: 'Media',
    icon: Music2,
    tone: 'coral',
    projectPath: 'apps/jukebox',
    url: '/apps/jukebox/',
  },
  {
    id: 'workout',
    name: 'Workout',
    description: 'Follow a guided seven-minute workout on the big screen.',
    category: 'Fitness',
    icon: Dumbbell,
    tone: 'green',
    projectPath: 'apps/workout',
    url: '/apps/workout/',
  },
  {
    id: 'scripture',
    name: 'Scripture',
    description: 'Read, search, and follow along with Scripture.',
    category: 'Reading',
    icon: BookOpen,
    tone: 'blue',
    projectPath: 'apps/scripture',
    url: '/apps/scripture/',
  },
]
