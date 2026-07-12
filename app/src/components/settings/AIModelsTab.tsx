import { ProviderCard } from "./ProviderCard.js";

export function AIModelsTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-8 border-b border-white/10 pb-6">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">AI Model Providers</h2>
        <p className="text-on-surface-variant text-sm max-w-2xl">
          Configure the AI models that power VibeOps intelligent features like auto-tagging, summarization, and codebase querying. Keys are stored locally on your device.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        
        <ProviderCard 
          settingKey="openai.api_key"
          name="OpenAI"
          subtitle="GPT-4 & Embeddings"
          placeholder="sk-..."
          borderColorClass="white/20"
          icon={
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <span className="text-black text-2xl">✹</span>
            </div>
          }
        />

        <ProviderCard 
          settingKey="anthropic.api_key"
          name="Anthropic"
          subtitle="Claude 3.5 Sonnet"
          placeholder="sk-ant-..."
          borderColorClass="[#D97757]/40"
          icon={
            <div className="w-12 h-12 bg-[#D97757]/20 rounded-xl flex items-center justify-center">
              <span className="font-serif italic text-2xl text-[#D97757]">C</span>
            </div>
          }
        />
        
        <ProviderCard 
          settingKey="google.api_key"
          name="Google"
          subtitle="Gemini 1.5 Pro"
          placeholder="AIza..."
          borderColorClass="[#4285F4]/40"
          icon={
            <div className="w-12 h-12 bg-[#4285F4]/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-[#4285F4]">memory</span>
            </div>
          }
        />

        <ProviderCard 
          settingKey="voyage.api_key"
          name="Voyage AI"
          subtitle="Premium Knowledge Embeddings"
          placeholder="pa-..."
          borderColorClass="[#8B5CF6]/40"
          icon={
            <div className="w-12 h-12 bg-[#8B5CF6]/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-[#8B5CF6]">explore</span>
            </div>
          }
        />
        
        <ProviderCard 
          settingKey="ollama.url"
          name="Local Model"
          subtitle="Ollama / Llama 3"
          placeholder="http://localhost:11434"
          borderColorClass="secondary/40"
          icon={
            <div className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center">
              <img src="https://ollama.com/public/icon-64x64.png" alt="Ollama" className="w-8 h-8" onError={(e) => e.currentTarget.style.display = 'none'} />
              <span className="material-symbols-outlined text-secondary absolute -z-10">smart_toy</span>
            </div>
          }
        />

      </div>
    </div>
  );
}
