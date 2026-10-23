import { describe, expect, it } from 'vitest'
import { formatDuree, messageErreurMicro } from './audio'

describe('notes vocales', () => {
  it('affiche la durée en minutes et secondes', () => {
    expect(formatDuree(0)).toBe('0:00')
    expect(formatDuree(7400)).toBe('0:07')
    expect(formatDuree(165_000)).toBe('2:45')
  })

  it('explique un refus du micro', () => {
    expect(messageErreurMicro(new DOMException('x', 'NotAllowedError'))).toMatch(/Micro refusé/)
  })
})
