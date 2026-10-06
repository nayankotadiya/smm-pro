import mongoose from 'mongoose';
import { env } from '../config/env';
import { SystemSetting } from '../models';

export interface ScriptGenerationParams {
  topic: string;
  niche?: string;
  tone?: string;
  language?: string;
  duration?: string;
  clientName?: string;
}

export interface GeneratedHook {
  id: number;
  style: string;
  text: string;
  tip: string;
}

export interface GeneratedScene {
  scene: number;
  timing: string;
  visual: string;
  voiceover: string;
  onScreenText: string;
}

export interface GeneratedScriptResponse {
  topic: string;
  niche: string;
  language: string;
  hooks: GeneratedHook[];
  scenes: GeneratedScene[];
  cta: {
    visual: string;
    speech: string;
  };
  fullScriptText: string;
  caption: string;
  hashtags: string[];
  poweredBy: 'gemini' | 'template';
  notice?: string;
}

export async function getGeminiApiKey(): Promise<string> {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const setting = await SystemSetting.findOne({ key: 'GEMINI_API_KEY' });
      if (setting && typeof setting.value === 'string' && setting.value.trim()) {
        return setting.value.trim();
      }
    }
  } catch {}
  return (env.gemini.apiKey || '').trim();
}

export async function saveGeminiApiKey(key: string, userId?: string): Promise<void> {
  await SystemSetting.findOneAndUpdate(
    { key: 'GEMINI_API_KEY' },
    {
      $set: {
        key: 'GEMINI_API_KEY',
        value: key.trim(),
        description: 'Google Gemini AI API Key for Script & Content Generation',
        updatedBy: userId as any,
      },
    },
    { upsert: true, new: true }
  );
}

export async function getAiStatus() {
  const key = await getGeminiApiKey();
  const configured = Boolean(key && key.length > 8);
  const maskedKey = configured
    ? `${key.slice(0, 6)}...${key.slice(-4)}`
    : null;
  return {
    configured,
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    maskedKey,
  };
}

/**
 * Intelligent high-converting script generator powered by Gemini 1.5 Flash
 * with offline creative fallback template if no API key is set yet.
 */
export async function generateScriptAssistance(
  params: ScriptGenerationParams
): Promise<GeneratedScriptResponse> {
  const topic = params.topic?.trim() || 'Exciting Product Collection';
  const niche = params.niche?.trim() || 'General Brand';
  const tone = params.tone?.trim() || 'High-Energy & Viral Reels';
  const language = params.language?.trim() || 'Gujarati & Hinglish';
  const duration = params.duration?.trim() || '30 Seconds Reel';
  const client = params.clientName?.trim() || 'Our Brand';

  const apiKey = await getGeminiApiKey();

  if (apiKey) {
    try {
      const prompt = `You are an elite Social Media Director and Viral Reel Scriptwriter.
Task: Write a high-converting, viral Instagram Reel / YouTube Shorts script package.

Client/Brand: ${client}
Niche/Industry: ${niche}
Video Topic: ${topic}
Tone & Style: ${tone}
Language: ${language} (Write authentic, spoken dialogue in ${language} as naturally spoken by creators in Gujarat and India).
Duration: ${duration}

Return ONLY valid JSON (no surrounding markdown code blocks, just raw JSON) with this exact schema:
{
  "hooks": [
    { "id": 1, "style": "Curiosity Hook", "text": "Hook text...", "tip": "Why this works in 0-3s" },
    { "id": 2, "style": "Problem-Solution Hook", "text": "Hook text...", "tip": "Addresses common mistake" },
    { "id": 3, "style": "Controversy / Bold Statement", "text": "Hook text...", "tip": "Stops the scroll instantly" },
    { "id": 4, "style": "Story / Lifestyle Hook", "text": "Hook text...", "tip": "Relatable emotional pull" },
    { "id": 5, "style": "Direct Value Hook", "text": "Hook text...", "tip": "Numbers or secret reveal" }
  ],
  "scenes": [
    {
      "scene": 1,
      "timing": "0:00 - 0:03",
      "visual": "Camera angle and actor action...",
      "voiceover": "Spoken dialogue in ${language}...",
      "onScreenText": "Catchy 3-4 word bold text on screen"
    },
    {
      "scene": 2,
      "timing": "0:04 - 0:12",
      "visual": "Product close-up / b-roll movement...",
      "voiceover": "Explanation or showcase in ${language}...",
      "onScreenText": "Highlight text"
    },
    {
      "scene": 3,
      "timing": "0:13 - 0:24",
      "visual": "Result / lifestyle showcase...",
      "voiceover": "Main benefit & reason to buy in ${language}...",
      "onScreenText": "Offer / USP"
    },
    {
      "scene": 4,
      "timing": "0:25 - 0:30",
      "visual": "Clear Call To Action with product in hand...",
      "voiceover": "Final punchy CTA in ${language}...",
      "onScreenText": "Save & Share"
    }
  ],
  "cta": {
    "visual": "Pointer to caption / save button",
    "speech": "Call to action spoken dialogue"
  },
  "fullScriptText": "Complete formatted script ready to be read aloud and shot, scene by scene.",
  "caption": "Viral Instagram caption with hook headline, body bullets, and call-to-action.",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5", "#Tag6", "#Tag7", "#Tag8", "#Tag9", "#Tag10", "#Tag11", "#Tag12", "#Tag13", "#Tag14", "#Tag15"]
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as any;
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          const parsed = JSON.parse(candidate);
          return {
            topic,
            niche,
            language,
            hooks: parsed.hooks || [],
            scenes: parsed.scenes || [],
            cta: parsed.cta || { visual: 'Pointer to DM', speech: 'DM us now' },
            fullScriptText:
              parsed.fullScriptText ||
              parsed.scenes
                ?.map(
                  (s: any) =>
                    `[Scene ${s.scene} (${s.timing})]\nVisual: ${s.visual}\nAudio: ${s.voiceover}\nText: ${s.onScreenText}`
                )
                .join('\n\n'),
            caption: parsed.caption || '',
            hashtags: parsed.hashtags || [],
            poweredBy: 'gemini',
          };
        }
      } else {
        const errJson = await res.json().catch(() => null);
        console.warn('[AI Service] Gemini API call returned error:', errJson);
      }
    } catch (err) {
      console.error('[AI Service] Gemini invocation failed:', err);
    }
  }

  // Graceful offline fallback template if key missing or temporarily unreachable
  return createOfflineTemplate(topic, niche, tone, language, client);
}

export async function generateCaptionAssistance(params: {
  title: string;
  script?: string;
  niche?: string;
  platform?: string;
}) {
  const apiKey = await getGeminiApiKey();
  const platform = params.platform || 'INSTAGRAM';

  if (apiKey) {
    try {
      const prompt = `Write an ultra-engaging, high-reach social media caption and 15 trending hashtags for ${platform}.
Title: ${params.title}
Niche: ${params.niche || 'Business'}
Script context: ${params.script ? params.script.slice(0, 500) : 'General promotion'}

Format as JSON:
{
  "caption": "Full caption with hook, value points, emojis, and call to action",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
    } catch (e) {
      console.warn('[AI Service] Caption generation error:', e);
    }
  }

  // Fallback caption
  const cleanTitle = params.title || 'Special Collection';
  return {
    caption: `✨ ${cleanTitle}\n\nLooking for the perfect choice that stands out? Look no further!\n\n👇 Drop your thoughts in the comments or DM us for full details!\n\nSave this reel for later inspiration! 📌`,
    hashtags: [
      `#${params.niche?.replace(/\s+/g, '') || 'Trending'}`,
      '#ViralReels',
      '#InstaDaily',
      '#ExplorePage',
      '#ReelKaroFeelKaro',
      '#QualityFirst',
      '#NewCollection',
      '#BestDeals',
      '#TrendingNow',
      '#MustWatch',
    ],
  };
}

function createOfflineTemplate(
  topic: string,
  niche: string,
  tone: string,
  language: string,
  client: string
): GeneratedScriptResponse {
  const isGuj = language.toLowerCase().includes('guj');

  const hooks: GeneratedHook[] = isGuj
    ? [
        {
          id: 1,
          style: 'Curiosity Hook (જિજ્ઞાસા)',
          text: `જો તમે પણ ${topic} શોધી રહ્યા છો, તો આ ૧ વાત પહેલા જાણી લો!`,
          tip: 'પ્રથમ ૩ સેકન્ડમાં દર્શકને વિડિયો સ્ક્રોલ કરતાં રોકશે.',
        },
        {
          id: 2,
          style: 'Mistake Hook (ભૂલ બચાવો)',
          text: `${topic} લેતા પહેલા ૯૦% લોકો આ મોટી ભૂલ કરે છે!`,
          tip: 'દર્શકને પોતાની ભૂલ સુધારવા આખો વિડિયો જોવાની ઉત્સુકતા જાગશે.',
        },
        {
          id: 3,
          style: 'Direct Benefit (સીધો ફાયદો)',
          text: `હવે ${topic} મેળવો એકદમ સરળ અને પ્રીમિયમ ક્વોલિટી સાથે ${client} પર!`,
          tip: 'સીધા ખરીદદારો માટે સૌથી અસરકારક.',
        },
        {
          id: 4,
          style: 'Secret / Hack (સિક્રેટ)',
          text: `આ રહ્યું ${client} નું સૌથી ખાસ સિક્રેટ કલેક્શન જે અત્યારે ટ્રેન્ડિંગમાં છે!`,
          tip: 'FOMO (Fear of Missing Out) ક્રિએટ કરે છે.',
        },
        {
          id: 5,
          style: 'Budget / Value Hook',
          text: `ઓછા બજેટમાં સૌથી લક્ઝુરિયસ લુક? જુઓ આ ${topic}!`,
          tip: 'વેલ્યુ-ફોકસ્ડ ગ્રાહકોનું ધ્યાન ખેંચે છે.',
        },
      ]
    : [
        {
          id: 1,
          style: 'Curiosity Hook',
          text: `If you are looking for ${topic}, stop scrolling right now!`,
          tip: 'Instant pattern interrupt in the first 3 seconds.',
        },
        {
          id: 2,
          style: 'Mistake Hook',
          text: `90% of people make this mistake when choosing ${topic}!`,
          tip: 'Drives high completion rate and watch time.',
        },
        {
          id: 3,
          style: 'Direct Benefit Hook',
          text: `Here is why ${client}'s ${topic} is breaking the internet!`,
          tip: 'Best for direct product conversion.',
        },
        {
          id: 4,
          style: 'Story / Transformation',
          text: `I tested ${topic} for a whole week, and here is what happened!`,
          tip: 'Builds authentic trust and connection.',
        },
        {
          id: 5,
          style: 'Insider Secret Hook',
          text: `The one secret nobody tells you about ${topic}...`,
          tip: 'Triggers viral shares and saves.',
        },
      ];

  const scenes: GeneratedScene[] = [
    {
      scene: 1,
      timing: '0:00 - 0:03',
      visual: `Fast hook opening shot: Creator holds or shows ${topic} close to lens with dynamic zoom.`,
      voiceover: hooks[0].text,
      onScreenText: `Wait for this! 😱`,
    },
    {
      scene: 2,
      timing: '0:04 - 0:12',
      visual: `Aesthetic close-up B-roll showcase: Lighting emphasizes details, texture, and craftsmanship.`,
      voiceover: isGuj
        ? `અહીં તમને મળે છે ૧૦૦% સુપીરિયર ફિનિશિંગ અને એક્સક્લુઝિવ ડિઝાઇન જે બીજા ક્યાંય જોવા નહીં મળે.`
        : `Take a look at this stunning design and unmatched craftsmanship that truly speaks for itself.`,
      onScreenText: `Pure Perfection ✨`,
    },
    {
      scene: 3,
      timing: '0:13 - 0:22',
      visual: `Model lifestyle shot or in-action demonstration showing practical elegance.`,
      voiceover: isGuj
        ? `રોજેરોજ પહેરવું હોય કે સ્પેશિયલ ઓકેઝન માટે—આ તમારા લુકને આપે છે કમ્પલીટ એલિગન્સ!`
        : `Whether for everyday wear or your biggest moments, this elevates your look effortlessly.`,
      onScreenText: `Everyday Luxury 💎`,
    },
    {
      scene: 4,
      timing: '0:23 - 0:30',
      visual: `Creator smiles at camera, points to bottom-left screen or holds brand box.`,
      voiceover: isGuj
        ? `તો મોડું શા માટે? હમણાં જ DM કરો અથવા સ્ટોર વિઝિટ કરો ${client} પર! સેવ કરી લો આ રીલ!`
        : `Don't wait! DM us right now to book yours or visit ${client} today! Save this reel!`,
      onScreenText: `DM Us Now! 📩`,
    },
  ];

  const fullScript = scenes
    .map(
      (s) =>
        `[SCENE ${s.scene} - ${s.timing}]\n🎥 VISUAL: ${s.visual}\n🎙️ AUDIO: "${s.voiceover}"\n📝 TEXT ON SCREEN: "${s.onScreenText}"`
    )
    .join('\n\n');

  return {
    topic,
    niche,
    language,
    hooks,
    scenes,
    cta: {
      visual: 'Point down to comment/DM button',
      speech: isGuj ? 'હમણાં જ DM કરો!' : 'DM us for details!',
    },
    fullScriptText: fullScript,
    caption: `✨ ${topic} | ${client}\n\nElevate your style with the latest trending collection designed for elegance and durability.\n\n📍 Available now at ${client}\n💬 DM us for price & order details!\n📌 Save this reel so you don't lose it!`,
    hashtags: [
      `#${niche.replace(/\s+/g, '')}`,
      '#ViralReels',
      '#TrendingReels',
      '#ReelKaroFeelKaro',
      '#InstagramReels',
      '#ExplorePage',
      '#NewCollection',
      '#LuxuryLifestyle',
      '#QualityMatters',
      '#MadeWithLove',
    ],
    poweredBy: 'template',
    notice:
      'Google Gemini API Key is not configured yet. Using offline smart creative template. Add your free Gemini API key in Settings > Integrations to unlock real-time AI generation.',
  };
}
