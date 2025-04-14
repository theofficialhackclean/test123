/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { Caption } from '../captions';

const BASE_URL = 'https://hackflixapi.vercel.app/api/febbox';

// Enhanced language map with case-insensitive matching
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
};

interface StreamData {
  streams: Record<string, string>;
  subtitles: Record<string, { subtitle_link: string; subtitle_name?: string }>;
  error?: string;
  name?: string;
  size?: string;
}

const getNormalizedLanguageCode = (languageName: string): string => {
  const normalized = languageName.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] ?? 'unknown';
};

const getUserToken = (): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem('febbox_ui_token') : null;
  } catch (e) {
    console.warn('Unable to access localStorage:', e);
    return null;
  }
};

const getRandomUserAgent = (): string => {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const apiUrl =
    ctx.media.type === 'movie'
      ? `${BASE_URL}/movie/${ctx.media.imdbId}`
      : `${BASE_URL}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  const userToken = getUserToken();
  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://pstream.org/',
    'Origin': 'https://pstream.org',
    ...(userToken && { 'ui-token': userToken }),
  };

  try {
    const data = await ctx.fetcher<StreamData>(apiUrl, {
      headers,
    });

    if (data?.error || !data?.streams) {
      throw new NotFoundError(data?.error || 'No streams available');
    }

    ctx.progress(50);

    // Process streams
    const streams = Object.entries(data.streams).reduce((acc, [quality, url]) => {
      if (quality === 'ORG') return acc; // Skip original quality if not needed

      const qualityKey = quality === '4K' ? 2160 : parseInt(quality.replace('P', ''), 10);
      if (!Number.isNaN(qualityKey) && !acc[qualityKey]) {
        acc[qualityKey] = url;
      }
      return acc;
    }, {} as Record<number, string>);

    // Process subtitles
    const captions: Caption[] = [];
    if (data.subtitles) {
      for (const [langKey, subtitleData] of Object.entries(data.subtitles)) {
        if (!subtitleData.subtitle_link) continue;

        const languageName = langKey.split('_')[0].toLowerCase();
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
          qualities: Object.fromEntries(
            Object.entries(streams)
              .filter(([_, url]) => !!url)
              .map(([quality, url]) => [
                quality,
                { type: 'mp4', url }
              ])
          ),
          type: 'file',
          flags: [flags.CORS_ALLOWED],
        },
      ],
    };
  } catch (error) {
    console.error('FED API request failed:', error);
    throw new NotFoundError('Failed to fetch from FED API');
  }
}

export const FedAPIScraper = makeSourcerer({
  id: 'fedapi',
  name: 'FED API (4K)',
  rank: 260,
  disabled: false, // Don't disable based on token to allow token injection later
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
