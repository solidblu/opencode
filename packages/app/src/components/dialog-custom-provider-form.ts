const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"

type Translator = (key: string, vars?: Record<string, string | number | boolean>) => string

export type ModelMetaKey =
  | "limit.context"
  | "limit.output"
  | "limit.input"
  | "attachment"
  | "reasoning"
  | "tool_call"
  | "temperature"
  | "cost.input"
  | "cost.output"

export type ModelMetaField = { key: ModelMetaKey; value: string }

export type ModelMetaOption = {
  key: ModelMetaKey
  label: string
  type: "number" | "boolean"
  placeholder?: string
}

export const MODEL_META_OPTIONS: ModelMetaOption[] = [
  { key: "limit.context", label: "Context window", type: "number", placeholder: "128000" },
  { key: "limit.output", label: "Max output tokens", type: "number", placeholder: "8192" },
  { key: "limit.input", label: "Max input tokens", type: "number", placeholder: "128000" },
  { key: "attachment", label: "Supports attachments", type: "boolean" },
  { key: "reasoning", label: "Supports reasoning", type: "boolean" },
  { key: "tool_call", label: "Supports tool calls", type: "boolean" },
  { key: "temperature", label: "Supports temperature", type: "boolean" },
  { key: "cost.input", label: "Input cost ($/1M tokens)", type: "number", placeholder: "1.50" },
  { key: "cost.output", label: "Output cost ($/1M tokens)", type: "number", placeholder: "2.00" },
]

export type ModelErr = {
  id?: string
  name?: string
  meta?: Array<string | undefined>
}

export type HeaderErr = {
  key?: string
  value?: string
}

export type ModelRow = {
  row: string
  id: string
  name: string
  meta: ModelMetaField[]
  err: ModelErr
}

export type HeaderRow = {
  row: string
  key: string
  value: string
  err: HeaderErr
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelRow[]
  headers: HeaderRow[]
  err: {
    providerID?: string
    name?: string
    baseURL?: string
  }
}

type ValidateArgs = {
  form: FormState
  t: Translator
  disabledProviders: string[]
  existingProviderIDs: Set<string>
  editingProviderID?: string
}

export function validateCustomProvider(input: ValidateArgs) {
  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const apiKey = input.form.apiKey.trim()

  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined

  const idError = !providerID
    ? input.t("provider.custom.error.providerID.required")
    : !PROVIDER_ID.test(providerID)
      ? input.t("provider.custom.error.providerID.format")
      : undefined

  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined
  const urlError = !baseURL
    ? input.t("provider.custom.error.baseURL.required")
    : !/^https?:\/\//.test(baseURL)
      ? input.t("provider.custom.error.baseURL.format")
      : undefined

  const disabled = input.disabledProviders.includes(providerID)
  const existsError = idError
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled && providerID !== input.editingProviderID
      ? input.t("provider.custom.error.providerID.exists")
      : undefined

  const seenModels = new Set<string>()
  const models = input.form.models.map((m) => {
    const id = m.id.trim()
    const idError = !id
      ? input.t("provider.custom.error.required")
      : seenModels.has(id)
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenModels.add(id)
            return undefined
          })()
    const nameError = !m.name.trim() ? input.t("provider.custom.error.required") : undefined
    const meta = m.meta.map((f) => {
      const opt = MODEL_META_OPTIONS.find((o) => o.key === f.key)
      if (opt?.type === "number" && f.value.trim() && isNaN(Number(f.value))) {
        return input.t("provider.custom.error.number")
      }
      return undefined
    })
    return { id: idError, name: nameError, meta }
  })
  const modelsValid = models.every((m) => !m.id && !m.name && m.meta.every((e) => !e))
  const modelConfig = Object.fromEntries(
    input.form.models.map((m) => [m.id.trim(), { name: m.name.trim(), ...metaToModelEntry(m.meta) }]),
  )

  const seenHeaders = new Set<string>()
  const headers = input.form.headers.map((h) => {
    const key = h.key.trim()
    const value = h.value.trim()

    if (!key && !value) return {}
    const keyError = !key
      ? input.t("provider.custom.error.required")
      : seenHeaders.has(key.toLowerCase())
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenHeaders.add(key.toLowerCase())
            return undefined
          })()
    const valueError = !value ? input.t("provider.custom.error.required") : undefined
    return { key: keyError, value: valueError }
  })
  const headersValid = headers.every((h) => !h.key && !h.value)
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((h) => ({ key: h.key.trim(), value: h.value.trim() }))
      .filter((h) => !!h.key && !!h.value)
      .map((h) => [h.key, h.value]),
  )

  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
  }

  const ok = !idError && !existsError && !nameError && !urlError && modelsValid && headersValid
  if (!ok) return { err, models, headers }

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      key,
      config: {
        npm: OPENAI_COMPATIBLE,
        name,
        ...(env ? { env: [env] } : {}),
        options: {
          baseURL,
          headers: headerConfig,
        },
        models: modelConfig,
      },
    },
  }
}

let row = 0

const nextRow = () => `row-${row++}`

export const modelRow = (): ModelRow => ({ row: nextRow(), id: "", name: "", meta: [], err: {} })
export const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })

function metaToModelEntry(meta: ModelMetaField[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const { key, value } of meta) {
    if (!value.trim()) continue
    const dot = key.indexOf(".")
    if (dot !== -1) {
      const ns = key.slice(0, dot)
      const field = key.slice(dot + 1)
      const num = Number(value)
      if (!isNaN(num)) result[ns] = { ...(result[ns] as Record<string, unknown> ?? {}), [field]: num }
    } else {
      result[key] = value === "true"
    }
  }
  return result
}

function parseModelMeta(m: Record<string, unknown>): ModelMetaField[] {
  const fields: ModelMetaField[] = []
  const limit = m.limit as { context?: number; output?: number; input?: number } | undefined
  if (limit?.context != null) fields.push({ key: "limit.context", value: String(limit.context) })
  if (limit?.output != null) fields.push({ key: "limit.output", value: String(limit.output) })
  if (limit?.input != null) fields.push({ key: "limit.input", value: String(limit.input) })
  const cost = m.cost as { input?: number; output?: number } | undefined
  if (cost?.input != null) fields.push({ key: "cost.input", value: String(cost.input) })
  if (cost?.output != null) fields.push({ key: "cost.output", value: String(cost.output) })
  if (m.attachment != null) fields.push({ key: "attachment", value: String(Boolean(m.attachment)) })
  if (m.reasoning != null) fields.push({ key: "reasoning", value: String(Boolean(m.reasoning)) })
  if (m.tool_call != null) fields.push({ key: "tool_call", value: String(Boolean(m.tool_call)) })
  if (m.temperature != null) fields.push({ key: "temperature", value: String(Boolean(m.temperature)) })
  return fields
}

type ProviderConfigEntry = {
  name?: string
  env?: string[]
  options?: { baseURL?: string; headers?: Record<string, string>; [key: string]: unknown }
  models?: Record<string, { name?: string; [key: string]: unknown } | null>
}

export function customProviderFormState(providerID: string, config: ProviderConfigEntry | undefined): Partial<FormState> {
  if (!config) return { providerID }
  const rawHeaders = config.options?.headers
  return {
    providerID,
    name: config.name ?? "",
    baseURL: config.options?.baseURL ?? "",
    apiKey: config.env?.[0] ? `{env:${config.env[0]}}` : "",
    models: Object.entries(config.models ?? {})
      .filter(([, m]) => m !== null)
      .map(([id, m]) => ({
        ...modelRow(),
        id,
        name: m?.name ?? "",
        meta: parseModelMeta((m ?? {}) as Record<string, unknown>),
      })),
    headers: Object.entries(rawHeaders ?? {}).map(([key, value]) => ({ ...headerRow(), key, value })),
  }
}
