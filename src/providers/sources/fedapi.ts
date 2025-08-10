/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

import { Caption } from '../captions';

const BASE_URL = 'https://hackflixapi.lightningx.online';

// Language mapping
const languageMap: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Arabic: 'ar',
  Russian: 'ru',
  Japanese: 'ja',
  Korean: 'ko',
  Chinese: 'zh',
  Hindi: 'hi',
  Turkish: 'tr',
  Dutch: 'nl',
  Polish: 'pl',
  Swedish: 'sv',
  Indonesian: 'id',
  Thai: 'th',
  Vietnamese: 'vi',
};

// Function to get user token
const getUserToken = (): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem('febbox_ui_token') : null;
  } catch (e) {
    console.warn('Unable to access localStorage:', e);
    return null;
  }
};

// Extract media type and title from the URL


interface StreamData {
  streams: Record<string, string>;
  subtitles: Record<string, any>;
  error?: string;
  name?: string;
  size?: string;
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const rawTitle = ctx.media.title || '';
  const isShow = (ctx as ShowScrapeContext).media.type === 'show';
  const type = isShow ? 'tv' : 'movie';

  let apiUrl = `${BASE_URL}/api/all?type=${type}&title=${encodeURIComponent(rawTitle)}`;

  if (isShow) {
    const showMedia = ctx as ShowScrapeContext;
    const season = showMedia.media.season?.number;
    const episode = showMedia.media.episode?.number;

    if (season == null || episode == null) {
      throw new NotFoundError('Missing season or episode number in context');
    }

    apiUrl += `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
  }

  const userToken = getUserToken();

  if (userToken) {
    console.log('Custom token found:', userToken);
  }

  const data = await ctx.fetcher<StreamData>(apiUrl, {
    headers: {
      ...(userToken && { 'ui-token': userToken }),
    },
  });

  if (!data) throw new NotFoundError('No response from API');
  if (data.error) throw new NotFoundError(data.error);

  ctx.progress(50);

  const streams = Object.entries(data.streams || {}).reduce((acc: Record<number, string>, [quality, url]) => {
    let qualityKey: number;
    if (quality.toLowerCase() === '4k') {
      qualityKey = 2160;
    } else if (quality.toLowerCase() === 'org') {
      return acc; // skip raw/original
    } else {
      qualityKey = parseInt(quality.replace(/p/i, ''), 10);
    }
    if (!Number.isNaN(qualityKey) && !acc[qualityKey]) {
      acc[qualityKey] = url;
    }
    return acc;
  }, {});

  const captions: Caption[] = [];
  if (data.subtitles && typeof data.subtitles === 'object') {
    for (const [langKey, subtitleData] of Object.entries(data.subtitles)) {
      const languageKeyPart = langKey.split('_')[0];
      const languageName = languageKeyPart.charAt(0).toUpperCase() + languageKeyPart.slice(1);
      const languageCode = languageMap[languageName]?.toLowerCase() ?? 'unknown';

      if (subtitleData && (subtitleData as any).subtitle_link) {
        const url = (subtitleData as any).subtitle_link;
        const isVtt = url.toLowerCase().endsWith('.vtt');
        captions.push({
          type: isVtt ? 'vtt' : 'srt',
          id: url,
          url,
          language: languageCode,
          hasCorsRestrictions: false,
        });
      }
    }
  }

  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions,
        qualities: {
          ...(streams[2160] && { '4k': { type: 'mp4', url: streams[2160] } }),
          ...(streams[1080] && { 1080: { type: 'mp4', url: streams[1080] } }),
          ...(streams[720] && { 720: { type: 'mp4', url: streams[720] } }),
          ...(streams[480] && { 480: { type: 'mp4', url: streams[480] } }),
          ...(streams[360] && { 360: { type: 'mp4', url: streams[360] } }),
        },
        type: 'file',
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const FedAPIScraper = makeSourcerer({
  id: 'fedapi',
  name: 'FED API (4K)',
  rank: 260,
  disabled: !getUserToken(),
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
