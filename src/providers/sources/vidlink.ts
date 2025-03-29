import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { getValidQualityFromString } from '@/utils/qualities'; // Adjust import path as needed
import { FileBasedStream } from '@/types/stream'; // Import your stream types

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

  // Process streams and map to your quality system
  const qualities: Partial<Record<'360' | '480' | '720' | '1080' | '4k', { type: 'mp4'; url: string }>> = {};

  for (const stream of apiRes.streams) {
    const qualityMatch = stream.label.match(/(4K|2160p|1080p|720p|480p|360p)/i);
    const qualityStr = qualityMatch ? qualityMatch[0] : '720p';
    const qualityKey = getValidQualityFromString(qualityStr);

    if (qualityKey !== 'unknown' && !qualities[qualityKey]) {
      qualities[qualityKey] = {
        type: 'mp4',
        url: stream.file,
      };
    }
  }

  // Create the stream object
  const stream: FileBasedStream = {
    id: 'primary',
    type: 'file',
    qualities,
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