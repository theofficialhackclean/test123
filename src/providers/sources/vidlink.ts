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

  // Create the stream object with all available streams
  const stream = {
    id: 'primary',
    type: 'file' as const,
    qualities: {
      default: {
        type: 'mp4',
        url: apiRes.streams[0].file, // Using first stream as default
      },
    },
    captions: [],
    flags: [flags.CORS_ALLOWED],
  };

  return {
    embeds: [],
    stream: [stream],
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
