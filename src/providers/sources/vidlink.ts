import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const vidlinkBase = 'https://vidlink.pro';

interface VidLinkStream {
  file: string;
  label: string;
  type: string;
}

interface VidLinkResponse {
  success: boolean;
  streams?: VidLinkStream[];
  message?: string;
}

const getVidLinkToken = (): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem('vidlink_token') : null;
  } catch (e) {
    console.warn('Unable to access localStorage:', e);
    return null;
  }
};

async function vidLinkScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const userToken = getVidLinkToken();
  
  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${vidlinkBase}/api/movie/${ctx.media.tmdbId}`;
  } else {
    apiUrl = `${vidlinkBase}/api/tv/${ctx.media.tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
  }

  if (userToken) {
    apiUrl += `${apiUrl.includes('?') ? '&' : '?'}token=${userToken}`;
  }

  const apiRes = await ctx.proxiedFetcher<VidLinkResponse>(apiUrl);

  if (!apiRes || !apiRes.success) {
    throw new NotFoundError(apiRes?.message || 'No response from VidLink API');
  }

  if (!apiRes.streams || apiRes.streams.length === 0) {
    throw new NotFoundError('No streams found');
  }

  // Find the best quality stream (prioritizing 4K/2160p)
  let bestStream = apiRes.streams[0];
  for (const stream of apiRes.streams) {
    if (stream.label.includes('4K') || stream.label.includes('2160p')) {
      bestStream = stream;
      break;
    }
  }

  // Map all available qualities
  const streams = apiRes.streams.reduce((acc: Record<string, string>, stream) => {
    let qualityKey: number;
    if (stream.label.includes('4K') || stream.label.includes('2160p')) {
      qualityKey = 2160;
    } else {
      qualityKey = parseInt(stream.label.replace('p', ''), 10) || 720;
    }

    if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
    acc[qualityKey] = stream.file;
    return acc;
  }, {});

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions: [],
        qualities: {
          ...(streams[2160] && {
            '4k': {
              type: 'mp4',
              url: streams[2160],
            },
          }),
          ...(streams[1080] && {
            1080: {
              type: 'mp4',
              url: streams[1080],
            },
          }),
          ...(streams[720] && {
            720: {
              type: 'mp4',
              url: streams[720],
            },
          }),
          ...(streams[480] && {
            480: {
              type: 'mp4',
              url: streams[480],
            },
          }),
          ...(streams[360] && {
            360: {
              type: 'mp4',
              url: streams[360],
            },
          }),
        },
        type: 'file',
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const vidLinkProvider = makeSourcerer({
  id: 'vidlink',
  name: 'VidLink',
  rank: 150,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidLinkScraper,
  scrapeShow: vidLinkScraper,
});