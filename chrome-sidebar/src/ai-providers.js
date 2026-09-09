// Public provider metadata shared by the settings page and Worker bundle.
// Model IDs are loaded from providers or entered by the user, never guessed.
export const AI_PROVIDERS = [
  {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',format:'responses'},
  {id:'anthropic',name:'Anthropic / Claude',baseUrl:'https://api.anthropic.com/v1',format:'anthropic'},
  {id:'google',name:'Google / Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',format:'chat'},
  {id:'xai',name:'xAI / Grok',baseUrl:'https://api.x.ai/v1',format:'chat'},
  {id:'zai',name:'Z.AI / GLM',baseUrl:'https://api.z.ai/api/paas/v4',format:'chat',manualModels:true},
  {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',format:'chat'},
  {id:'mistral',name:'Mistral',baseUrl:'https://api.mistral.ai/v1',format:'chat'},
  {id:'groq',name:'Groq',baseUrl:'https://api.groq.com/openai/v1',format:'chat'},
  {id:'openrouter',name:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1',format:'chat'},
  {id:'together',name:'Together AI',baseUrl:'https://api.together.ai/v1',format:'chat'},
  {id:'fireworks',name:'Fireworks AI',baseUrl:'https://api.fireworks.ai/inference/v1',format:'chat'},
  {id:'perplexity',name:'Perplexity',baseUrl:'https://api.perplexity.ai',format:'chat',manualModels:true},
  {id:'cerebras',name:'Cerebras',baseUrl:'https://api.cerebras.ai/v1',format:'chat'},
  {id:'moonshot',name:'Moonshot / Kimi',baseUrl:'https://api.moonshot.ai/v1',format:'chat'},
  {id:'custom',name:'Other compatible API',baseUrl:'',format:'chat'}
];
export const providerFor = id => AI_PROVIDERS.find(provider=>provider.id===id);
