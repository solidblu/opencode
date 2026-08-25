import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Switch } from "@opencode-ai/ui/switch"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@/utils/toast"
import { batch, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ExternalLink } from "@/components/external-link"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import {
  type FormState,
  type ModelMetaKey,
  headerRow,
  modelRow,
  MODEL_META_OPTIONS,
  validateCustomProvider,
} from "./dialog-custom-provider-form"

type Props = {
  onBack: () => void
  initialConfig?: Partial<FormState>
  originalProviderID?: string
}

export function DialogCustomProvider(props: Props) {
  const language = useLanguage()

  return (
    <Dialog
      class="h-full"
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={props.onBack}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <CustomProviderForm initialConfig={props.initialConfig} originalProviderID={props.originalProviderID} />
    </Dialog>
  )
}

export function CustomProviderForm(
  props: { autofocus?: boolean; initialConfig?: Partial<FormState>; originalProviderID?: string } = {},
) {
  const dialog = useDialog()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const language = useLanguage()

  const [form, setForm] = createStore<FormState>({
    providerID: props.initialConfig?.providerID ?? "",
    name: props.initialConfig?.name ?? "",
    baseURL: props.initialConfig?.baseURL ?? "",
    apiKey: props.initialConfig?.apiKey ?? "",
    models: props.initialConfig?.models ?? [modelRow()],
    headers: props.initialConfig?.headers ?? [headerRow()],
    err: {},
  })

  const addModel = () => {
    setForm(
      "models",
      produce((rows) => {
        rows.push(modelRow())
      }),
    )
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm(
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addHeader = () => {
    setForm(
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm(
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)
    if (key === "apiKey") return
    setForm("err", key, undefined)
  }

  const setModel = (index: number, key: "id" | "name", value: string) => {
    batch(() => {
      setForm("models", index, key, value)
      setForm("models", index, "err", key, undefined)
    })
  }

  const addModelMeta = (modelIdx: number, key: ModelMetaKey) => {
    const opt = MODEL_META_OPTIONS.find((o) => o.key === key)
    if (!opt) return
    setForm(
      "models",
      modelIdx,
      "meta",
      produce((fields) => fields.push({ key, value: opt.type === "boolean" ? "false" : "" })),
    )
  }

  const removeModelMeta = (modelIdx: number, metaIdx: number) => {
    setForm(
      "models",
      modelIdx,
      "meta",
      produce((fields) => fields.splice(metaIdx, 1)),
    )
  }

  const setModelMeta = (modelIdx: number, metaIdx: number, value: string) => {
    setForm("models", modelIdx, "meta", metaIdx, "value", value)
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

  const [isAutoFetching, setIsAutoFetching] = createSignal(false)

  const autoPopulateModels = async () => {
    const baseURL = form.baseURL.trim()
    if (!baseURL || isAutoFetching()) return
    setIsAutoFetching(true)
    try {
      const headers: Record<string, string> = {}
      const apiKey = form.apiKey.trim()
      if (apiKey && !apiKey.startsWith("{env:")) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }
      for (const h of form.headers) {
        const key = h.key.trim()
        const value = h.value.trim()
        if (key && value) headers[key] = value
      }
      const url = `${baseURL.replace(/\/$/, "")}/models`
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = await res.json()
      const items: Array<{ id: string }> = data?.data ?? []
      if (items.length === 0) {
        showToast({ title: language.t("provider.custom.models.auto.empty") })
        return
      }
      const existingIDs = new Set(form.models.map((m) => m.id.trim()).filter(Boolean))
      const existingEmpty = form.models.length === 1 && !form.models[0].id.trim()
      const newItems = items.filter((m) => !existingIDs.has(m.id))
      const toAdd = newItems.map((m) => ({ ...modelRow(), id: m.id, name: m.id }))
      if (toAdd.length === 0) {
        showToast({ title: language.t("provider.custom.models.auto.empty") })
        return
      }
      setForm("models", existingEmpty ? toAdd : [...form.models, ...toAdd])
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.custom.models.label"),
        description: `${toAdd.length} model${toAdd.length === 1 ? "" : "s"} added`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("provider.custom.models.auto.error"), description: message })
    } finally {
      setIsAutoFetching(false)
    }
  }

  const validate = () => {
    const output = validateCustomProvider({
      form,
      t: language.t,
      disabledProviders: serverSync().data.config.disabled_providers ?? [],
      existingProviderIDs: new Set(serverSync().data.provider.all.keys()),
      editingProviderID: props.originalProviderID,
    })
    batch(() => {
      setForm("err", output.err)
      output.models.forEach((err, index) => setForm("models", index, "err", err))
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })
    return output.result
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (result: NonNullable<ReturnType<typeof validate>>) => {
      if ((await serverSDK().protocol) !== "v1") throw new Error(language.t("provider.custom.unavailable"))
      const disabledProviders = serverSync().data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== result.providerID)

      if (result.key) {
        await serverSDK().client.auth.set({
          providerID: result.providerID,
          auth: {
            type: "api",
            key: result.key,
          },
        })
      }

      await serverSync().updateConfig({
        provider: { [result.providerID]: result.config },
        disabled_providers: nextDisabled,
      })
      return result
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending) return

    const result = validate()
    if (!result) return
    saveMutation.mutate(result)
  }

  return (
    <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
      <div class="px-2.5 flex gap-4 items-center">
        <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
        <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
      </div>

      <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
        <p class="text-14-regular text-text-base">
          {language.t("provider.custom.description.prefix")}
          <ExternalLink href="https://opencode.ai/docs/providers/#custom-provider" tabIndex={-1}>
            {language.t("provider.custom.description.link")}
          </ExternalLink>
          {language.t("provider.custom.description.suffix")}
        </p>

        <div class="flex flex-col gap-4">
          <TextField
            autofocus={props.autofocus ?? true}
            label={language.t("provider.custom.field.providerID.label")}
            placeholder={language.t("provider.custom.field.providerID.placeholder")}
            description={language.t("provider.custom.field.providerID.description")}
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
            validationState={form.err.providerID ? "invalid" : undefined}
            error={form.err.providerID}
            disabled={!!props.originalProviderID}
          />
          <TextField
            label={language.t("provider.custom.field.name.label")}
            placeholder={language.t("provider.custom.field.name.placeholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            validationState={form.err.name ? "invalid" : undefined}
            error={form.err.name}
          />
          <TextField
            label={language.t("provider.custom.field.baseURL.label")}
            placeholder={language.t("provider.custom.field.baseURL.placeholder")}
            value={form.baseURL}
            onChange={(v) => setField("baseURL", v)}
            validationState={form.err.baseURL ? "invalid" : undefined}
            error={form.err.baseURL}
          />
          <TextField
            label={language.t("provider.custom.field.apiKey.label")}
            placeholder={language.t("provider.custom.field.apiKey.placeholder")}
            description={language.t("provider.custom.field.apiKey.description")}
            value={form.apiKey}
            onChange={(v) => setField("apiKey", v)}
          />
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
            <div class="flex items-center gap-1.5">
              <Tooltip value={language.t("provider.custom.models.auto.tooltip")} placement="top">
                <span class="text-text-weak cursor-default">
                  <Icon name="help" size="small" />
                </span>
              </Tooltip>
              <Button
                type="button"
                size="small"
                variant="ghost"
                disabled={isAutoFetching() || !form.baseURL.trim()}
                onClick={autoPopulateModels}
              >
                {isAutoFetching() ? language.t("provider.custom.models.auto.fetching") : language.t("provider.custom.models.auto")}
              </Button>
            </div>
          </div>
          <For each={form.models}>
            {(m, i) => (
              <div class="flex flex-col gap-1.5" data-row={m.row}>
                <div class="flex gap-2 items-start">
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.models.id.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.id.placeholder")}
                      value={m.id}
                      onChange={(v) => setModel(i(), "id", v)}
                      validationState={m.err.id ? "invalid" : undefined}
                      error={m.err.id}
                    />
                  </div>
                  <div class="flex-1">
                    <TextField
                      label={language.t("provider.custom.models.name.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.name.placeholder")}
                      value={m.name}
                      onChange={(v) => setModel(i(), "name", v)}
                      validationState={m.err.name ? "invalid" : undefined}
                      error={m.err.name}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon="trash"
                    variant="ghost"
                    class="mt-1.5"
                    onClick={() => removeModel(i())}
                    disabled={form.models.length <= 1}
                    aria-label={language.t("provider.custom.models.remove")}
                  />
                </div>
                <Show when={m.meta.length > 0}>
                  <div class="flex flex-col gap-1.5 pl-1">
                    <For each={m.meta}>
                      {(field, fi) => {
                        const opt = MODEL_META_OPTIONS.find((o) => o.key === field.key)!
                        return (
                          <div class="flex items-center gap-2">
                            <span class="text-11-regular text-text-weak w-[140px] shrink-0">{opt.label}</span>
                            <Show
                              when={opt.type === "boolean"}
                              fallback={
                                <div class="flex-1">
                                  <TextField
                                    label={opt.label}
                                    hideLabel
                                    placeholder={opt.placeholder ?? ""}
                                    value={field.value}
                                    onChange={(v) => setModelMeta(i(), fi(), v)}
                                    validationState={m.err.meta?.[fi()] ? "invalid" : undefined}
                                    error={m.err.meta?.[fi()]}
                                  />
                                </div>
                              }
                            >
                              <Switch
                                checked={field.value === "true"}
                                onChange={(v) => setModelMeta(i(), fi(), String(v))}
                              />
                            </Show>
                            <IconButton
                              type="button"
                              icon="close-small"
                              variant="ghost"
                              onClick={() => removeModelMeta(i(), fi())}
                              aria-label="Remove property"
                            />
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>
                <Show when={m.meta.length < MODEL_META_OPTIONS.length}>
                  <select
                    class="self-start text-12-regular text-text-weak bg-transparent cursor-pointer focus:outline-none"
                    onChange={(e) => {
                      const key = e.currentTarget.value as ModelMetaKey
                      if (key) {
                        addModelMeta(i(), key)
                        e.currentTarget.value = ""
                      }
                    }}
                  >
                    <option value="">{language.t("provider.custom.models.addProp")}</option>
                    <For each={MODEL_META_OPTIONS.filter((o) => !m.meta.some((f) => f.key === o.key))}>
                      {(opt) => <option value={opt.key}>{opt.label}</option>}
                    </For>
                  </select>
                </Show>
              </div>
            )}
          </For>
          <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
            {language.t("provider.custom.models.add")}
          </Button>
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
          <For each={form.headers}>
            {(h, i) => (
              <div class="flex gap-2 items-start" data-row={h.row}>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.key.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.key.placeholder")}
                    value={h.key}
                    onChange={(v) => setHeader(i(), "key", v)}
                    validationState={h.err.key ? "invalid" : undefined}
                    error={h.err.key}
                  />
                </div>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.value.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.value.placeholder")}
                    value={h.value}
                    onChange={(v) => setHeader(i(), "value", v)}
                    validationState={h.err.value ? "invalid" : undefined}
                    error={h.err.value}
                  />
                </div>
                <IconButton
                  type="button"
                  icon="trash"
                  variant="ghost"
                  class="mt-1.5"
                  onClick={() => removeHeader(i())}
                  disabled={form.headers.length <= 1}
                  aria-label={language.t("provider.custom.headers.remove")}
                />
              </div>
            )}
          </For>
          <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
            {language.t("provider.custom.headers.add")}
          </Button>
        </div>

        <Button
          class="w-auto self-start"
          type="submit"
          size="large"
          variant="primary"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
        </Button>
      </form>
    </div>
  )
}
