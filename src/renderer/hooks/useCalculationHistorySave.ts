import { useCallback, useState } from 'react'

import type { SaveCalculationHistoryInput } from '../../shared/calculation-history-types'

function getHistoryWarning(error: unknown): string {
  if (error instanceof Error) {
    return `Calculation completed, but history was not saved: ${error.message}`
  }
  return 'Calculation completed, but history was not saved.'
}

export function useCalculationHistorySave(onSaved?: () => void) {
  const [historyWarning, setHistoryWarning] = useState<string | null>(null)

  const clearHistoryWarning = useCallback(() => {
    setHistoryWarning(null)
  }, [])

  const saveCalculationHistory = useCallback(
    async (input: SaveCalculationHistoryInput): Promise<boolean> => {
      setHistoryWarning(null)

      try {
        if (!window.electronAPI?.history) {
          throw new Error('Calculation history is only available in the desktop app.')
        }

        await window.electronAPI.history.save(input)
        onSaved?.()
        return true
      } catch (error) {
        setHistoryWarning(getHistoryWarning(error))
        return false
      }
    },
    [onSaved],
  )

  return {
    historyWarning,
    clearHistoryWarning,
    saveCalculationHistory,
  }
}
