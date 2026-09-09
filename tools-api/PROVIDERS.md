# AI integrations

The Worker makes provider calls with encrypted saved credentials. The extension sends a connection ID, model and messages, never retrieves provider keys, and cannot override the destination or credentials on generation requests.

| Provider | Format | Official reference |
| --- | --- | --- |
| OpenAI | Responses (`store: false`) | [Text generation](https://developers.openai.com/api/docs/guides/text) |
| Anthropic / Claude | Messages | [Messages](https://platform.claude.com/docs/en/api/messages/create) |
| Google / Gemini | Chat Completions | [Compatibility](https://ai.google.dev/gemini-api/docs/openai) |
| xAI / Grok | Chat Completions | [API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions) |
| Z.AI / GLM | Chat Completions | [API](https://docs.z.ai/api-reference/llm/chat-completion) |
| DeepSeek | Chat Completions | [Introduction](https://api-docs.deepseek.com/) |
| Mistral | Chat Completions | [Chat](https://docs.mistral.ai/api/endpoint/chat) |
| Groq | Chat Completions | [Compatibility](https://console.groq.com/docs/openai) |
| OpenRouter | Chat Completions | [Reference](https://openrouter.ai/docs/api/reference/overview) |
| Together AI | Chat Completions | [Compatibility](https://docs.together.ai/docs/inference/openai-compatibility) |
| Fireworks AI | Chat Completions | [Compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility) |
| Perplexity | Chat Completions | [Sonar](https://docs.perplexity.ai/docs/sonar/quickstart) |
| Cerebras | Chat Completions | [Compatibility](https://inference-docs.cerebras.ai/resources/openai) |
| Moonshot / Kimi | Chat Completions | [API](https://platform.kimi.ai/docs/api/chat) |
| Custom | Chat Completions, Responses or Anthropic Messages | Supply a public HTTPS API base URL |

The public provider registry is `chrome-sidebar/src/ai-providers.js`, bundled into the extension and Worker. These adapters support non-streaming text generation, not each provider's entire product API. Images, audio, video, embeddings, tool execution and provider-specific search/citation features are not exposed.

## Endpoints

All routes require the existing bearer access token.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/v1/ai-connections/<uuid>/models` | Returns `{models: [{id, name}], partial?, manual?, message?}` |
| POST | `/v1/ai-connections/<uuid>/test` | Accepts `{model?}`; sends a fixed short prompt with a 256-token limit |
| POST | `/v1/ai-connections/<uuid>/generate` | Accepts `{model?, messages: [{role, content}], maxTokens?}` |

Roles are `system`, `user`, `assistant`; content is text. Supply a model or save a default. Limits: 40 messages, 32,000 total characters, output tokens between 128 and 8,192 (default 2,048). The shared result is `{text, model, provider, durationMs, usage: {inputTokens, outputTokens}, stopReason, warning}`. Missing usage is null. Empty/truncated output is reported explicitly. Reasoning traces are omitted; refusal text may be returned.

Models are never guessed or hardcoded. Z.AI and Perplexity use manual model IDs. Others request `/models`; partial lists are labeled. A failed catalog request does not prevent manually entering a model. Catalogs can contain non-text models, and a successful catalog request is not proof that a key can generate text. Test connection makes an actual generation request and may use provider credit.

Named integrations use their official host, with optional same-host path overrides (such as Z.AI's coding path). For another host, select Custom and save its credential. IP literals, local hostnames, query strings and embedded credentials are rejected. Changing provider, endpoint or custom format clears the old key unless replaced. Redirects and automatic retries are disabled. Response bodies are limited to 2 MB and calls to 25 seconds; a timed-out request may still be billed. Provider errors are summarized without reflecting raw error bodies or keys.

The playground uses the selected saved connection. Save/cancel pending edits before running. Playground model overrides do not change the saved default. Prompts and responses stay in page memory and go to Cloudflare and the selected provider; this app does not persist them. Provider retention and billing policies apply. Gmail still uses on-device AI.

## Verification

Adapter fixtures cover every registered provider, all three wire formats, error handling, redaction, limits and model listing. Route tests verify that credentials are decrypted internally and caller-supplied keys/URLs are ignored. Page tests cover fetching models, testing, running, dirty-state protection and text-safe output. No provider credentials were saved when this integration was built, so successful provider inference requires adding a key and clicking Test connection. Live Worker routing is checked separately without provider credentials.
