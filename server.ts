import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const EIFFEL_LAT = 48.85837;
const EIFFEL_LNG = 2.29448;

interface MapsPlaceLink {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{
    text: string;
    uri?: string;
    author?: string;
  }>;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractMapsGroundingLinks(rawChunks: unknown): MapsPlaceLink[] {
  if (!Array.isArray(rawChunks)) return [];
  const results: MapsPlaceLink[] = [];
  const seenUris = new Set<string>();

  for (const chunk of rawChunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    const mapsObj = (chunk as Record<string, unknown>).maps as Record<string, unknown> | undefined;
    if (!mapsObj || typeof mapsObj !== 'object') continue;

    const uri = typeof mapsObj.uri === 'string' ? mapsObj.uri : '';
    const title = typeof mapsObj.title === 'string' ? mapsObj.title : 'View on Google Maps';
    const placeId = typeof mapsObj.placeId === 'string' ? mapsObj.placeId : undefined;

    const snippets: MapsPlaceLink['reviewSnippets'] = [];
    const answerSources = mapsObj.placeAnswerSources as
      | { reviewSnippets?: Array<Record<string, unknown>> }
      | undefined;

    if (answerSources && Array.isArray(answerSources.reviewSnippets)) {
      for (const snip of answerSources.reviewSnippets) {
        if (!snip || typeof snip !== 'object') continue;
        const text =
          typeof snip.reviewText === 'string'
            ? snip.reviewText
            : typeof snip.text === 'string'
              ? snip.text
              : typeof snip.snippet === 'string'
                ? snip.snippet
                : '';
        const snipUri =
          typeof snip.googleMapsUri === 'string'
            ? snip.googleMapsUri
            : typeof snip.uri === 'string'
              ? snip.uri
              : undefined;
        const author =
          typeof snip.authorAttribution === 'object' &&
          snip.authorAttribution !== null &&
          typeof (snip.authorAttribution as Record<string, unknown>).displayName === 'string'
            ? ((snip.authorAttribution as Record<string, unknown>).displayName as string)
            : undefined;
        if (text || snipUri) {
          snippets.push({ text, uri: snipUri, author });
        }
      }
    }

    if (uri && !seenUris.has(uri)) {
      seenUris.add(uri);
      results.push({ title, uri, placeId, reviewSnippets: snippets });
    }
  }

  return results;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/maps-explore', async (req, res) => {
    try {
      const body = req.body as {
        query?: unknown;
        landmarkName?: unknown;
        latitude?: unknown;
        longitude?: unknown;
      };

      const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
      if (!rawQuery || rawQuery.length > 400) {
        res.status(400).json({ error: 'Please enter a valid place query (1–400 characters).' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Google Maps Grounding requires GEMINI_API_KEY to be configured in Settings > Secrets.',
        });
        return;
      }

      const lat =
        typeof body.latitude === 'number' && Number.isFinite(body.latitude)
          ? body.latitude
          : EIFFEL_LAT;
      const lng =
        typeof body.longitude === 'number' && Number.isFinite(body.longitude)
          ? body.longitude
          : EIFFEL_LNG;
      const landmarkCtx =
        typeof body.landmarkName === 'string' && body.landmarkName.trim()
          ? `Focusing on ${body.landmarkName.trim()} near the Eiffel Tower in Paris (within a 3 km² / ~980m radius). `
          : 'Focusing on the Eiffel Tower and its surrounding 3 km² area (~980m radius) in Paris, France. ';

      const prompt =
        `${landmarkCtx}Provide concise, accurate, up-to-date architectural and visitor facts ` +
        `for the following query using Google Maps data. Keep the answer clear, well-structured, ` +
        `and under 180 words.\n\nQuery: ${rawQuery}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          },
        },
      });

      const text = response.text ?? '';
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const places = extractMapsGroundingLinks(rawChunks);

      res.json({
        text,
        places,
        coordinates: { latitude: lat, longitude: lng },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected Maps Grounding error.';
      console.error('[maps-explore] Error:', message);
      const isQuota = /RESOURCE_EXHAUSTED|429/i.test(message);
      const isAuth = /API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(message);
      const status = isQuota ? 429 : isAuth ? 403 : 500;
      const userMessage = isAuth
        ? 'Gemini API key was rejected. Check your key in Settings > Secrets.'
        : isQuota
          ? 'API rate limit reached. Try again shortly or configure a billing-enabled key in Settings > Secrets.'
          : 'Unable to retrieve live Google Maps information right now.';
      res.status(status).json({ error: userMessage });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tour Eiffel 3D Sketch server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
