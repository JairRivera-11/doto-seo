import React, { useEffect, useState } from 'react';
import {
  getAISettings,
  selectAIProvider,
  saveSessionGeminiKey,
  saveSessionClaudeKey,
  saveSessionOpenAIKey,
  saveSessionDeepSeekKey,
  saveDeepSeekReasoningEffort,
} from '../services/api';
import { Cpu, KeyRound, Lock, CheckCircle2, AlertCircle, ShieldCheck, Info, BrainCircuit } from 'lucide-react';

type ProviderId = 'claude' | 'qwen2vl' | 'gemini' | 'openai' | 'deepseek' | 'local';
type KeyedProviderId = 'claude' | 'gemini' | 'openai' | 'deepseek';

interface ProviderDef {
  id: ProviderId;
  label: string;
  modelLabel: string;
  description: string;
  needsKey: boolean;
  keyPlaceholder?: string;
}

// Six fully independent providers. Claude and Qwen2-VL used to be bundled
// under one card (Qwen2-VL as a "model choice" within Claude), but Qwen2-VL
// is a separate, free, local model - it never touches Claude's API or key,
// so it now stands on its own just like the rest.
const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude',
    modelLabel: 'claude-sonnet-5',
    description:
      'Modelo de propósito general de Anthropic - recomendado para tareas de texto y razonamiento (redacción, análisis). También puede analizar imágenes, pero no es la opción más eficiente para Alt Text.',
    needsKey: true,
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'qwen2vl',
    label: 'Qwen2-VL',
    modelLabel: 'vía Ollama, local',
    description:
      'Recomendado para Alt Text: modelo de visión dedicado que corre 100% en tu servidor mediante Ollama. Al ser gratuito, es independiente de Claude - no usa su API Key ni requiere cuenta de Anthropic.',
    needsKey: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    modelLabel: 'gemini-3.7-flash',
    description: 'Análisis visual multimodal avanzado para imágenes complejas o de múltiples ángulos.',
    needsKey: true,
    keyPlaceholder: 'AIzaSy... / AQ....',
  },
  {
    id: 'openai',
    label: 'ChatGPT',
    modelLabel: 'gpt-5.6-terra',
    description:
      'gpt-4o fue retirado de la API de OpenAI (feb-2026), así que este proveedor usa gpt-5.6-terra - el modelo multimodal vigente de OpenAI con mejor relación costo/capacidad.',
    needsKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    modelLabel: 'deepseek-flash (V4.1)',
    description:
      'DeepSeek V3 y R1 son modelos de solo texto - no pueden analizar imágenes. Este proveedor usa V4.1 Flash, el único modelo de DeepSeek con visión real, con un switch de razonamiento profundo como equivalente a R1.',
    needsKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'local',
    label: 'IA Local',
    modelLabel: 'Motor determinista en servidor',
    description: '100% privado. La imagen no sale de tu servidor ni se envía a ningún proveedor externo.',
    needsKey: false,
  },
];

const KEY_SAVERS: Record<KeyedProviderId, (key: string) => Promise<{ success: boolean; configured: boolean; message: string }>> = {
  claude: saveSessionClaudeKey,
  gemini: saveSessionGeminiKey,
  openai: saveSessionOpenAIKey,
  deepseek: saveSessionDeepSeekKey,
};

export const AISettingsView: React.FC = () => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('claude');
  const [configured, setConfigured] = useState<Record<ProviderId, boolean>>({
    claude: false,
    qwen2vl: true,
    gemini: false,
    openai: false,
    deepseek: false,
    local: true,
  });
  const [keyInputs, setKeyInputs] = useState<Record<KeyedProviderId, string>>({
    claude: '',
    gemini: '',
    openai: '',
    deepseek: '',
  });
  const [deepseekReasoningEffort, setDeepseekReasoningEffort] = useState<'none' | 'high'>('none');
  const [isTogglingReasoning, setIsTogglingReasoning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingKeyFor, setIsSavingKeyFor] = useState<KeyedProviderId | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await getAISettings();
      setSelectedProvider(data.selectedProvider);
      setConfigured({
        claude: data.claudeConfigured,
        qwen2vl: data.qwen2vlConfigured,
        gemini: data.geminiConfigured,
        openai: data.openaiConfigured,
        deepseek: data.deepseekConfigured,
        local: data.localConfigured,
      });
      setDeepseekReasoningEffort(data.deepseekReasoningEffort);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al cargar la configuración de IA.');
    } finally {
      setIsLoading(false);
    }
  };

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleSelectProvider = async (id: ProviderId) => {
    setSelectedProvider(id);
    setErrorMessage(null);
    try {
      const res = await selectAIProvider(id);
      setSelectedProvider(res.selectedProvider);
      const label = PROVIDERS.find((p) => p.id === res.selectedProvider)?.label || res.selectedProvider;
      flashSuccess(`Proveedor de IA predeterminado actualizado a: ${label}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al seleccionar el proveedor de IA.');
    }
  };

  const handleSaveKey = async (id: KeyedProviderId) => {
    const key = keyInputs[id].trim();
    if (!key) return;
    setIsSavingKeyFor(id);
    setErrorMessage(null);
    try {
      const res = await KEY_SAVERS[id](key);
      setConfigured((prev) => ({ ...prev, [id]: res.configured }));
      setKeyInputs((prev) => ({ ...prev, [id]: '' }));
      flashSuccess(res.message);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar la API Key.');
    } finally {
      setIsSavingKeyFor(null);
    }
  };

  const handleToggleDeepSeekReasoning = async () => {
    const next = deepseekReasoningEffort === 'high' ? 'none' : 'high';
    setIsTogglingReasoning(true);
    setErrorMessage(null);
    try {
      const res = await saveDeepSeekReasoningEffort(next);
      setDeepseekReasoningEffort(res.reasoningEffort);
      flashSuccess(
        res.reasoningEffort === 'high'
          ? 'DeepSeek ahora usa razonamiento profundo (equivalente a R1).'
          : 'DeepSeek ahora usa modo rápido (equivalente a V3, sin razonamiento extendido).'
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al ajustar el modo de razonamiento de DeepSeek.');
    } finally {
      setIsTogglingReasoning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#6012C3] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center space-x-2">
          <Cpu className="w-5 h-5 text-[#6012C3]" />
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Configuración de IA</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Elige aquí el modelo de IA que usará todo el sistema (por ejemplo, Alt Text AI) y guarda su API Key en un
          solo lugar. El proveedor seleccionado queda activo de inmediato, sin necesidad de tocar código ni reiniciar
          el servidor.
        </p>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const isActive = selectedProvider === p.id;
          const isConfigured = configured[p.id];

          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
                isActive ? 'border-[#6012C3] ring-1 ring-[#6012C3]/20' : 'border-slate-200'
              }`}
            >
              <button
                id={`ai-settings-select-${p.id}`}
                onClick={() => handleSelectProvider(p.id)}
                className="w-full flex items-start justify-between text-left cursor-pointer"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isActive ? 'border-[#6012C3]' : 'border-slate-300'
                    }`}
                  >
                    {isActive && <div className="w-2 h-2 rounded-full bg-[#6012C3]" />}
                  </div>
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-sm font-bold text-slate-900">{p.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {p.modelLabel}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#6012C3]/10 text-[#6012C3]">
                          Activo
                        </span>
                      )}
                      {p.needsKey ? (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isConfigured ? 'Clave activa en RAM' : 'Falta API Key'}
                        </span>
                      ) : (
                        p.id !== 'local' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            Gratis - sin API Key
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{p.description}</p>
                  </div>
                </div>
              </button>

              {/* Inline API Key entry - appears right here when this provider is selected */}
              {p.needsKey && isActive && (
                <div className="mt-4 pl-7 space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    API Key de {p.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={keyInputs[p.id as KeyedProviderId]}
                      onChange={(e) => setKeyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder={isConfigured ? 'Clave ya guardada - ingresa una nueva para reemplazarla' : p.keyPlaceholder}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
                    />
                    <button
                      id={`ai-settings-save-key-${p.id}`}
                      onClick={() => handleSaveKey(p.id as KeyedProviderId)}
                      disabled={!keyInputs[p.id as KeyedProviderId].trim() || isSavingKeyFor === p.id}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#6012C3] hover:bg-[#4d0e9e] rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1.5 shrink-0"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{isSavingKeyFor === p.id ? 'Guardando...' : 'Guardar'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* DeepSeek: reasoning-effort switch - the closest equivalent to
                  "switch to R1", since deepseek-flash is one model with a
                  toggle rather than separate V3/R1 model IDs (neither of
                  which can see images anyway). */}
              {p.id === 'deepseek' && isActive && (
                <div className="mt-4 pl-7">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-2">
                        <BrainCircuit className="w-4 h-4 text-[#6012C3] shrink-0" />
                        <span className="text-[11px] font-semibold text-slate-700">
                          Razonamiento profundo (equivalente a R1)
                        </span>
                      </div>
                      <button
                        id="ai-settings-deepseek-reasoning-toggle"
                        role="switch"
                        aria-checked={deepseekReasoningEffort === 'high'}
                        onClick={handleToggleDeepSeekReasoning}
                        disabled={isTogglingReasoning}
                        className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${
                          deepseekReasoningEffort === 'high' ? 'bg-[#6012C3]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            deepseekReasoningEffort === 'high' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {deepseekReasoningEffort === 'high'
                        ? 'Activado: el modelo piensa más antes de responder (más lento y costoso, análisis más cuidadoso) - equivalente a usar R1.'
                        : 'Desactivado (recomendado para Alt Text): respuesta rápida y económica, sin razonamiento extendido - equivalente a usar V3.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Qwen2-VL: no key - just the Ollama requirement, spelled out */}
              {p.id === 'qwen2vl' && isActive && (
                <div className="mt-4 pl-7">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                    No necesita API Key ni depende de Claude en ningún sentido. Requiere tener{' '}
                    <a
                      href="https://ollama.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#6012C3] font-semibold hover:underline"
                    >
                      Ollama
                    </a>{' '}
                    corriendo en tu servidor (por defecto{' '}
                    <code className="bg-white px-1 py-0.5 rounded font-mono border border-slate-200">http://localhost:11434</code>
                    ) con el modelo descargado:{' '}
                    <code className="bg-white px-1 py-0.5 rounded font-mono border border-slate-200">ollama pull qwen2.5vl</code>.
                    Si tu Ollama corre en otra URL o con otro nombre de modelo, defínelo con las variables de entorno{' '}
                    <code className="bg-white px-1 py-0.5 rounded font-mono border border-slate-200">LOCAL_OLLAMA_URL</code> /{' '}
                    <code className="bg-white px-1 py-0.5 rounded font-mono border border-slate-200">LOCAL_OLLAMA_QWEN_MODEL</code>.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-start space-x-2.5">
        <ShieldCheck className="w-4 h-4 text-[#6012C3] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Privacidad:</strong> cada API Key se guarda <strong>únicamente en memoria RAM</strong> del servidor
          durante la sesión activa - nunca en disco, base de datos ni registros, y sin variables de entorno de
          respaldo. Funciona igual que la conexión a Shopify: debes ingresarla de nuevo cada vez que el servidor se
          reinicia, y se borra por completo en ese momento. Qwen2-VL no usa API Key: solo depende de que Ollama esté
          corriendo en tu servidor.
        </p>
      </div>

      <div className="p-4 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 flex items-start space-x-2.5">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Este proveedor y su clave se usan como valor por defecto en todo el sistema (incluyendo Alt Text AI). Aun
          así, dentro de cada herramienta puedes elegir un proveedor distinto para una ejecución puntual sin cambiar
          esta configuración general.
        </p>
      </div>

      <div className="flex items-center space-x-1.5 text-[10px] text-slate-400">
        <Lock className="w-3 h-3" />
        <span>Selección y claves en memoria de sesión - sin persistencia externa.</span>
      </div>
    </div>
  );
};
