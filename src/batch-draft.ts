import { useEffect, useState } from 'react'
import { loadBatchDraft, saveBatchDraft, type TelegramBatchDraft } from './beat-store'

export const emptyBatchDraft: TelegramBatchDraft = {
  selectedIds: [], files: [], credits: {}, caption: '', coverCaption: '', cover: null,
}

export function useBatchDraft(scope?: string) {
  const [state, setState] = useState<{ scope: string; draft: TelegramBatchDraft; revision: number; status: 'saved' | 'saving' | 'error' }>()
  useEffect(() => {
    if (!scope) return
    let active = true
    void loadBatchDraft(scope).then((draft) => {
      if (active) setState({ scope, draft: draft ?? emptyBatchDraft, revision: 0, status: 'saved' })
    }).catch(() => {
      if (active) setState({ scope, draft: emptyBatchDraft, revision: 0, status: 'error' })
    })
    return () => { active = false }
  }, [scope])

  const current = state?.scope === scope ? state : undefined
  const draft = current?.draft ?? emptyBatchDraft
  const hasContent = Boolean(draft.selectedIds.length || draft.files.length || draft.caption || draft.coverCaption || draft.cover)
  const revision = current?.revision ?? 0
  useEffect(() => {
    if (!scope || !revision) return
    let active = true
    function finish(status: 'saved' | 'error') {
      if (active) setState((saved) => saved && saved.scope === scope && saved.revision === revision ? { ...saved, status } : saved)
    }
    void saveBatchDraft(scope, hasContent ? draft : null).then(() => finish('saved'), () => finish('error'))
    return () => { active = false }
  }, [scope, draft, hasContent, revision])

  function update(updater: (draft: TelegramBatchDraft) => TelegramBatchDraft) {
    setState((saved) => saved && saved.scope === scope
      ? { ...saved, draft: updater(saved.draft), revision: saved.revision + 1, status: 'saving' } : saved)
  }

  return { draft, update, hasContent, canRetry: revision > 0, status: current?.status ?? 'loading' }
}
