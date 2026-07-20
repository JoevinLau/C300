import { requestLocalApi } from '@/lib/local-api'
import type {
  NaicsConfirmation,
  NaicsFactorOption,
  NaicsMappingApi,
  NaicsSearchResult,
} from './naics-mapping-workflow'

export const naicsMappingApi: NaicsMappingApi = {
  search: (materialName: string) => requestLocalApi({
    path: `/api/naics/search?q=${encodeURIComponent(materialName)}`,
  }) as Promise<NaicsSearchResult>,
  suggest: async (materialName: string) => {
    const suggestion = await requestLocalApi({
      path: `/api/naics/llm-suggest?material=${encodeURIComponent(materialName)}`,
    }).catch(() => null) as (Partial<NaicsFactorOption> & { suggested_naics?: string }) | null
    if (!suggestion) return null

    const code = suggestion.suggested_naics || suggestion.code
    if (!code) return null

    return {
      ...suggestion,
      code,
      description: suggestion.description || 'AI suggestion - please confirm',
    }
  },
  factor: async (code: string) => requestLocalApi({
    path: `/api/naics/factor/${encodeURIComponent(code)}`,
  }).catch(() => null) as Promise<NaicsFactorOption | null>,
  confirm: (materialName: string, naicsCode: string) => requestLocalApi({
    path: '/api/naics/confirm',
    method: 'POST',
    json: { material_token: materialName, mapped_naics: naicsCode, user_id: 'default' },
  }) as Promise<NaicsConfirmation>,
  calculate: (rows) => requestLocalApi({
    path: '/api/calculate/batch',
    method: 'POST',
    json: rows,
  }) as ReturnType<NaicsMappingApi['calculate']>,
}
