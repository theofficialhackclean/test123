import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { getValidQualityFromString } from '@/utils/qualities'; // Import from correct location

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

function compareQualities(a: string, b: string): number {
  const qualityOrder = ['4k', '1080', '720', '480', '360'];
  return qualityOrder.indexOf(b) - qualityOrder.indexOf(a);
}

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

  const streams = apiRes.streams.reduce((acc: Record<string, string>, stream) => {
    const qualityMatch = stream.label.match(/(4K|2160p|1080p|720p|480p|360p)/i);
    let qualityStr = '720'; // default quality
    
    if (qualityMatch) {
      qualityStr = qualityMatch[0];
    }

    const qualityKey = getValidQualityFromString(qualityStr);
    if (qualityKey === 'unknown') return acc;

    if (!acc[qualityKey] || compareQualities(qualityKey, Object.keys(acc)[0]) > 0) {
      acc[qualityKey] = stream.file;
    }
    return acc;
  }, {});

  const qualities: Record<string, { type: string; url: string }> = {};
  const sortedQualities = Object.keys(streams).sort(compareQualities);

  sortedQualities.forEach(quality => {
    qualities[quality] = {
      type: 'mp4',
      url: streams[quality],
    };
  });

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions: [],
        qualities,
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