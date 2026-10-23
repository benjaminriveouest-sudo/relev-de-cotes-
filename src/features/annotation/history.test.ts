import { describe, expect, it } from 'vitest'
import { commit, createHistory, redo, undo } from './history'

describe('annuler / rétablir', () => {
  it('annule puis rétablit', () => {
    let h = createHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    h = undo(h)
    expect(h.present).toBe(1)
    h = undo(h)
    expect(h.present).toBe(0)
    h = undo(h)
    expect(h.present).toBe(0)
    h = redo(h)
    h = redo(h)
    expect(h.present).toBe(2)
  })

  it('une nouvelle action efface ce qui pouvait être rétabli', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c')
    h = commit(undo(h), 'd')
    expect(h.future).toEqual([])
    expect(redo(h).present).toBe('d')
    expect(undo(h).present).toBe('b')
  })

  it('limite la taille de l’historique', () => {
    let h = createHistory(0)
    for (let i = 1; i <= 250; i++) h = commit(h, i)
    expect(h.past.length).toBe(100)
    expect(h.present).toBe(250)
  })
})
