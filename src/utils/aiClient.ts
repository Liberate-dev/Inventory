/**
 * AI Client for Preventive Maintenance recommendations.
 *
 * Gemini part follows the official quickstart you linked:
 *   https://ai.google.dev/gemini-api/docs/quickstart#javascript
 *
 * (new @google/genai SDK + config.responseMimeType for reliable JSON)
 *
 * Models expanded from the rate limits doc you linked (https://ai.google.dev/gemini-api/docs/rate-limits)
 * + cross-checked with your earlier Professional Assistant services for what tends to be available on AI Studio keys.
 */

import { GoogleGenAI } from '@google/genai';

export interface RichItemForAI {
  id: string;
  name: string;
  roomName: string;
  condition: string;
  sku?: string;               // unique label for the specific physical instance
  procurementDate: string;
  ageMonths: number;
  recentLogs: string;
  specs: string;
}

export interface AIRecommendation {
  itemId: string;
  reason: string;
  recommendedDate: string;
}

const GEMINI_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '';
const CEREBRAS_KEY = (import.meta.env.VITE_CEREBRAS_API_KEY as string | undefined) || '';
const OPENROUTER_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) || '';

const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

const TODAY = new Date().toISOString().split('T')[0];

function sanitizeRecommendations(raw: any[]): AIRecommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && r.itemId && r.reason && r.recommendedDate)
    .map((r) => ({
      itemId: String(r.itemId),
      reason: String(r.reason).slice(0, 280),
      recommendedDate: String(r.recommendedDate) >= TODAY ? String(r.recommendedDate) : TODAY,
    }))
    .slice(0, 3);
}

async function callGemini(itemsContext: RichItemForAI[]): Promise<AIRecommendation[]> {
  if (!GEMINI_KEY || !ai) throw new Error('NO_GEMINI_KEY');

  const prompt = buildPrompt(itemsContext);

  // Curated list from https://ai.google.dev/gemini-api/docs/rate-limits
  // (AI Studio free/paid keys). Prioritizing "Lite" and stable Flash models first
  // because they usually have better free-tier RPM/TPM and less "high demand" 503s.
  // Order informed by your last run (gemini-2.5-flash-lite succeeded after many 429/503/404).
  const MODELS = [
    'gemini-2.5-flash-lite',           // succeeded in your last test run
    'gemini-2.5-flash-lite-preview',
    'gemini-2.0-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
  ];

  // Follows the official quickstart JS example you linked:
  // https://ai.google.dev/gemini-api/docs/quickstart#javascript
  // Using ai.models.generateContent + config (the proper way for structured output)
  const client = ai!;   // safe because of the guard above

  async function generateWithGemini(promptText: string, modelIndex = 0): Promise<string> {
    if (modelIndex >= MODELS.length) {
      throw new Error('All Gemini models failed');
    }

    const modelName = MODELS[modelIndex];

    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      });

      const text = response.text || '';

      console.log(`✅ AI via Gemini (${modelName})`);
      return text;
    } catch (err: any) {
      const msg = String(err?.message || err);
      console.warn(`⚠️ Gemini [${modelName}] failed: ${msg}`);

      // If this key is completely out of free quota (common with shared/demo keys),
      // don't waste time trying the rest of the list.
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('limit: 0')) {
        throw new Error('GEMINI_QUOTA_EXHAUSTED');
      }

      // Be polite to the API on 429/503. Small delay before next model.
      await new Promise(r => setTimeout(r, 300));

      // fallback to next model (same spirit as the reference service)
      return generateWithGemini(promptText, modelIndex + 1);
    }
  }

  try {
    const text = await generateWithGemini(prompt);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const recs = sanitizeRecommendations(parsed);
    if (recs.length === 0) {
      throw new Error('Gemini returned no valid JSON recommendations');
    }

    return recs;
  } catch (err: any) {
    throw new Error(`Gemini failed: ${err.message}`);
  }
}

async function callOpenRouter(itemsContext: RichItemForAI[]): Promise<AIRecommendation[]> {
  if (!OPENROUTER_KEY) throw new Error('NO_OPENROUTER_KEY');

  const prompt = buildPrompt(itemsContext);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'ProDocs AI',
    },
    body: JSON.stringify({
      models: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-small-3.1-24b-instruct:free'
      ],
      messages: [
        {
          role: 'system',
          content: 'You are a precise maintenance consultant for school inventory. Always respond with ONLY a valid JSON array, no extra text, no markdown.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
  }

  const recs = sanitizeRecommendations(parsed);
  if (recs.length === 0) throw new Error('OpenRouter returned no valid recommendations');
  const usedModel = data.model || 'openrouter';
  console.log(`✅ AI via OpenRouter (${usedModel})`);
  return recs;
}

async function callCerebras(itemsContext: RichItemForAI[]): Promise<AIRecommendation[]> {
  if (!CEREBRAS_KEY) throw new Error('NO_CEREBRAS_KEY');

  const prompt = buildPrompt(itemsContext);

  // Exact model from Professional Assistant/server/services/cerebrasService.js
  const model = 'llama3.1-8b';

  try {
    const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CEREBRAS_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a precise maintenance consultant for school inventory. Always respond with ONLY a valid JSON array, no extra text, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 2048,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Cerebras ${res.status}: ${txt}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const recs = sanitizeRecommendations(parsed);
    if (recs.length === 0) throw new Error('Cerebras returned no valid recommendations');
    console.log(`✅ AI via Cerebras (${model})`);
    return recs;
  } catch (err: any) {
    throw new Error(`Cerebras failed: ${err.message}`);
  }
}

function buildPrompt(itemsContext: RichItemForAI[]): string {
  return `Kamu adalah konsultan pemeliharaan preventif untuk inventaris sekolah (SMPK Santa Maria 2).

Tugas: Analisis data item berikut dan rekomendasikan 1 sampai 3 item yang paling membutuhkan pemeliharaan preventif dalam waktu dekat.
Gunakan informasi TANGGAL (procurementDate / umur), riwayat log, kondisi saat ini, dan spesifikasi untuk membuat alasan yang spesifik dan profesional (bahasa Indonesia yang jelas).

Aturan output:
- Kembalikan HANYA JSON array valid, tanpa markdown, tanpa penjelasan tambahan.
- Setiap objek: { "itemId": string, "reason": string (1-2 kalimat, sebutkan usia/tanggal/log jika relevan), "recommendedDate": "YYYY-MM-DD" (pilih tanggal 14-90 hari ke depan dari hari ini, jangan lampau) }
- Prioritaskan item dengan usia tinggi, kondisi 'service'/'damaged', atau sudah lama tidak ada maintenance log.

Data item (JSON):
${JSON.stringify(itemsContext, null, 2)}

Hasil (JSON array saja):`;
}

/**
 * Quality router for maintenance recommendations.
 * Order (matching Professional Assistant aiRouter "quality" mode):
 *   Gemini → OpenRouter → Cerebras
 *
 * Throws only if ALL providers with keys fail.
 * Returns empty array only if no keys at all (caller should simulate).
 */
export async function getMaintenanceRecommendations(
  itemsContext: RichItemForAI[]
): Promise<{ recommendations: AIRecommendation[]; provider: string }> {
  const errors: string[] = [];

  // 1. Gemini (best for structured JSON)
  if (GEMINI_KEY) {
    try {
      const recs = await callGemini(itemsContext);
      return { recommendations: recs, provider: 'gemini' };
    } catch (e: any) {
      errors.push(`Gemini: ${e.message}`);
    }
  }

  // 2. OpenRouter
  if (OPENROUTER_KEY) {
    try {
      const recs = await callOpenRouter(itemsContext);
      return { recommendations: recs, provider: 'openrouter' };
    } catch (e: any) {
      errors.push(`OpenRouter: ${e.message}`);
    }
  }

  // 3. Cerebras (last resort)
  if (CEREBRAS_KEY) {
    try {
      const recs = await callCerebras(itemsContext);
      return { recommendations: recs, provider: 'cerebras' };
    } catch (e: any) {
      errors.push(`Cerebras: ${e.message}`);
    }
  }

  if (errors.length > 0) {
    console.warn('All AI providers failed with these errors:', errors);
    // Throw a richer error so the UI can show the actual reasons
    const richError = new Error('ALL_PROVIDERS_FAILED');
    (richError as any).providerErrors = errors;
    throw richError;
  }

  // No keys configured at all
  return { recommendations: [], provider: 'none' };
}

export function hasAnyAIKey(): boolean {
  return !!(GEMINI_KEY || CEREBRAS_KEY || OPENROUTER_KEY);
}

export function getAIStatus(): { available: boolean; provider: string; label: string } {
  if (GEMINI_KEY) return { available: true, provider: 'gemini', label: 'Google Gemini' };
  if (OPENROUTER_KEY) return { available: true, provider: 'openrouter', label: 'OpenRouter' };
  if (CEREBRAS_KEY) return { available: true, provider: 'cerebras', label: 'Cerebras' };
  return { available: false, provider: 'none', label: 'Tidak ada API key' };
}

// ============================================================
// NEW: AI for Item Name deduplication / canonicalization (point 1)
// + Smart code generation following rules + context (point 2)
// ============================================================

export interface ItemNameSuggestion {
  suggestedName: string;
  category?: string;
  reason: string;
  isRedundant?: boolean;
}

export interface SmartCodeResult {
  suggestedSku: string;
  reason?: string;
}

function buildNameSuggestionPrompt(userName: string, existingTypes: any[], managedCategories: any[] = []): string {
  const typeList = existingTypes.map((t: any) => `${t.name}${t.category ? ` [${t.category}]` : ''}`).slice(0, 50);
  const catList = managedCategories.map((c: any) => c.name).slice(0, 50);
  return `Kamu adalah pengelola data inventaris sekolah (Manajemen Barang).

User mengetik nama item baru: "${userName}"

Daftar master "Item" (tipe) yang sudah terdaftar di sistem:
${typeList.length ? typeList.join(', ') : '(belum ada)'}

Daftar Kategori yang dikelola secara terpusat di Manajemen Kategori (Manajemen Barang):
${catList.length ? catList.join(', ') : '(belum ada)'}

Tugas:
- Sarankan nama KANONIK yang konsisten (kapitalisasi benar, singkat, jelas, hindari redundansi/duplikat seperti "Meja" vs "Meja Kerja" jika sudah ada yang mirip).
- Jika nama user sudah bagus atau sangat mirip existing, sarankan nama existing yang paling cocok atau perbaikan kecil.
- Sarankan kategori yang paling pas, **hanya dari daftar Kategori yang dikelola di Manajemen Kategori** jika relevan (jangan asal buat kategori baru).
- Berikan alasan singkat (1 kalimat).

Output HANYA JSON valid (tanpa markdown, tanpa teks lain):
{
  "suggestedName": "string",
  "category": "string atau null",
  "reason": "string singkat",
  "isRedundant": boolean
}`;
}

async function callGeminiNameSuggestion(userName: string, existingTypes: any[], managedCategories: any[] = []): Promise<ItemNameSuggestion> {
  if (!GEMINI_KEY || !ai) throw new Error('NO_GEMINI_KEY');
  const prompt = buildNameSuggestionPrompt(userName, existingTypes, managedCategories);

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const modelName of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 512 },
      });
      const text = response.text || '';
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.suggestedName) {
        console.log(`✅ AI name suggestion via Gemini (${modelName})`);
        return {
          suggestedName: String(parsed.suggestedName).trim(),
          category: parsed.category ? String(parsed.category) : undefined,
          reason: String(parsed.reason || ''),
          isRedundant: !!parsed.isRedundant,
        };
      }
    } catch (e: any) {
      if (String(e?.message).includes('RESOURCE_EXHAUSTED')) throw new Error('GEMINI_QUOTA_EXHAUSTED');
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Gemini name suggestion failed');
}

async function callOpenRouterNameSuggestion(userName: string, existingTypes: any[], managedCategories: any[] = []): Promise<ItemNameSuggestion> {
  if (!OPENROUTER_KEY) throw new Error('NO_OPENROUTER_KEY');
  const prompt = buildNameSuggestionPrompt(userName, existingTypes, managedCategories);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Inventory AI',
    },
    body: JSON.stringify({
      models: ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.3-70b-instruct:free'],
      messages: [
        { role: 'system', content: 'Kamu adalah asisten inventaris yang presisi. Jawab HANYA dengan JSON valid.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  let parsed: any; try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  if (!parsed?.suggestedName) throw new Error('OpenRouter returned no valid suggestion');
  console.log('✅ AI name suggestion via OpenRouter');
  return {
    suggestedName: String(parsed.suggestedName).trim(),
    category: parsed.category || undefined,
    reason: String(parsed.reason || ''),
    isRedundant: !!parsed.isRedundant,
  };
}

async function callCerebrasNameSuggestion(userName: string, existingTypes: any[], managedCategories: any[] = []): Promise<ItemNameSuggestion> {
  if (!CEREBRAS_KEY) throw new Error('NO_CEREBRAS_KEY');
  const prompt = buildNameSuggestionPrompt(userName, existingTypes, managedCategories);

  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CEREBRAS_KEY}` },
    body: JSON.stringify({
      model: 'llama3.1-8b',
      messages: [
        { role: 'system', content: 'Kamu adalah asisten inventaris yang presisi. Jawab HANYA dengan JSON valid.' },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 512,
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Cerebras ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  let parsed: any; try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
  if (!parsed?.suggestedName) throw new Error('Cerebras returned no valid suggestion');
  console.log('✅ AI name suggestion via Cerebras');
  return {
    suggestedName: String(parsed.suggestedName).trim(),
    category: parsed.category || undefined,
    reason: String(parsed.reason || ''),
    isRedundant: !!parsed.isRedundant,
  };
}

export async function suggestCanonicalItemName(
  userName: string,
  existingTypes: any[],
  managedCategories: any[] = []
): Promise<ItemNameSuggestion> {
  const errors: string[] = [];

  if (GEMINI_KEY) {
    try { return await callGeminiNameSuggestion(userName, existingTypes, managedCategories); }
    catch (e: any) { errors.push(`Gemini: ${e.message}`); }
  }
  if (OPENROUTER_KEY) {
    try { return await callOpenRouterNameSuggestion(userName, existingTypes, managedCategories); }
    catch (e: any) { errors.push(`OpenRouter: ${e.message}`); }
  }
  if (CEREBRAS_KEY) {
    try { return await callCerebrasNameSuggestion(userName, existingTypes, managedCategories); }
    catch (e: any) { errors.push(`Cerebras: ${e.message}`); }
  }

  if (errors.length) {
    const err = new Error('ALL_PROVIDERS_FAILED_FOR_NAME');
    (err as any).providerErrors = errors;
    throw err;
  }
  throw new Error('NO_AI_KEYS_FOR_NAME_SUGGESTION');
}

// --- Smart SKU / Label code with AI + rumus (formula) ---

function buildCodePrompt(name: string, typeName: string | undefined, roomName: string | undefined, category?: string): string {
  return `Kamu adalah generator kode inventaris sekolah.

Item baru:
- Nama: "${name}"
- Tipe master: ${typeName || 'Umum'}
- Kategori (dari Manajemen Kategori di Manajemen Barang): ${category || 'Umum'}
- Lokasi/ruangan: ${roomName || 'Tidak diketahui'}

Rumus yang disukai (konsisten dengan sistem):
- Gunakan singkatan ruangan (3 huruf kapital) + singkatan tipe/item (3-5 huruf) + nomor urut 3 digit.
- Contoh bagus: LAB-MEJ-003, KLS-KUR-012, GUD-BOL-007
- Hindari spasi, pakai dash, UPPERCASE.
- Buat unik dan mudah dibaca.
- Jika ada kategori, pertimbangkan singkatan kategori jika relevan untuk konsistensi.

Output HANYA JSON:
{ "suggestedSku": "string KODE", "reason": "1 kalimat singkat kenapa kode ini bagus" }`;
}

async function callGeminiCode(name: string, typeName?: string, roomName?: string, category?: string): Promise<SmartCodeResult> {
  if (!GEMINI_KEY || !ai) throw new Error('NO_GEMINI_KEY');
  const prompt = buildCodePrompt(name, typeName, roomName, category);

  for (const modelName of ['gemini-2.5-flash-lite', 'gemini-2.0-flash']) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 256 },
      });
      const text = response.text || '';
      let parsed: any; try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.suggestedSku) {
        console.log(`✅ AI code via Gemini (${modelName})`);
        return { suggestedSku: String(parsed.suggestedSku).toUpperCase().trim(), reason: parsed.reason };
      }
    } catch (e: any) {
      if (String(e.message).includes('RESOURCE_EXHAUSTED')) throw new Error('GEMINI_QUOTA_EXHAUSTED');
    }
  }
  throw new Error('Gemini code gen failed');
}

export async function generateSmartCodeWithAI(
  name: string,
  typeName?: string,
  roomName?: string,
  category?: string
): Promise<SmartCodeResult> {
  const errors: string[] = [];

  if (GEMINI_KEY) {
    try { return await callGeminiCode(name, typeName, roomName, category); }
    catch (e: any) { errors.push(`Gemini: ${e.message}`); }
  }
  // Fallbacks can be added for OpenRouter/Cerebras if wanted, but for code Gemini is usually sufficient and fast.
  // For brevity we can fall back to simple local if no key, but here we let caller fallback.

  if (errors.length) {
    const err = new Error('AI_CODE_FAILED');
    (err as any).providerErrors = errors;
    throw err;
  }
  throw new Error('NO_AI_KEY_FOR_CODE');
}
