/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { Caption } from '../captions';

const BASE_URL = 'https://fed-api.pstream.org/cache';

// Enhanced language map with case-insensitive matching and common variations
const LANGUAGE_MAP: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  arabic: 'ar',
  russian: 'ru',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  hindi: 'hi',
  turkish: 'tr',
  dutch: 'nl',
  polish: 'pl',
  swedish: 'sv',
  indonesian: 'id',
  thai: 'th',
  vietnamese: 'vi',
  // Common variations
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'pt-br': 'pt',
};

interface StreamData {
  streams: Record<string, string>;
  subtitles: Record<string, { subtitle_link: string; subtitle_name?: string }>;
  error?: string;
  name?: string;
  size?: string;
}

const getNormalizedLanguageCode = (languageName: string): string => {
  const normalized = languageName.toLowerCase().replace(/[^a-z]/g, ''); // Remove special chars
  return LANGUAGE_MAP[normalized] ?? 'unknown';
};

const getRandomUserAgent = (): string => {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
};

const getRequestHeaders = (): Record<string, string> => ({
  'User-Agent': getRandomUserAgent(),
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://pstream.org/',
  'Origin': 'https://pstream.org',
  'DNT': '1',
  'Connection': 'keep-alive',
});

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const apiUrl =
    ctx.media.type === 'movie'
      ? `${BASE_URL}/${ctx.media.imdbId}`
      : `${BASE_URL}/${ctx.media.imdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  try {
    const data = await ctx.fetcher<StreamData>(apiUrl, {
      headers: getRequestHeaders(),
    });

    if (data?.error || !data?.streams) {
      throw new NotFoundError(data?.error || 'No streams available');
    }

    ctx.progress(50);

    // Process streams with better quality handling
    const streams = Object.entries(data.streams).reduce((acc, [quality, url]) => {
      if (!url || quality === 'ORG') return acc; // Skip empty or original quality

      const qualityKey = quality === '4K' ? 2160 : parseInt(quality.replace('P', ''), 10);
      if (!Number.isNaN(qualityKey) {
        acc[qualityKey] = url;
      }
      return acc;
    }, {} as Record<number, string>);

    // Process subtitles with better language detection
    const captions: Caption[] = [];
    if (data.subtitles) {
      for (const [langKey, subtitleData] of Object.entries(data.subtitles)) {
        if (!subtitleData?.subtitle_link) continue;

        const languageName = langKey.split('_')[0];
        const languageCode = getNormalizedLanguageCode(languageName);
        const isVtt = subtitleData.subtitle_link.toLowerCase().endsWith('.vtt');

        captions.push({
          type: isVtt ? 'vtt' : 'srt',
          id: subtitleData.subtitle_link,
          url: subtitleData.subtitle_link,
          language: languageCode,
          hasCorsRestrictions: false,
        });
      }
    }

    ctx.progress(90);

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          captions,
          qualities: Object.entries(streams).reduce((acc, [quality, url]) => {
            const qualityName = quality === '2160' ? '4k' : quality;
            acc[qualityName] = { type: 'mp4', url };
            return acc;
          }, {} as Record<string, { type: string; url: string }>),
          type: 'file',
          flags: [flags.CORS_ALLOWED],
        },
      ],
    };
  } catch (error) {
    console.error('FED DB API request failed:', error);
    throw new NotFoundError('Failed to fetch from FED DB API');
  }
}

export const FedAPIDBScraper = makeSourcerer({
  id: 'fedapidb',
  name: 'FED DB (Beta)',
  rank: 259,
  disabled: false, // Always enabled to allow token injection if available
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
