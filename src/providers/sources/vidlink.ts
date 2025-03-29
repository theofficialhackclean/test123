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
  
  // Construct the appropriate URL based on media type
  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${vidlinkBase}/api/movie/${ctx.media.tmdbId}`;
  } else {
    apiUrl = `${vidlinkBase}/api/tv/${ctx.media.tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
  }

  // Add token if available
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

  // Process streams to find the best quality
  const streams = apiRes.streams.reduce((acc: Record<string, string>, stream) => {
    let qualityKey: number | string;
    
    // Parse quality from label (e.g., "1080p", "720p", "4K")
    const qualityMatch = stream.label.match(/(4K|2160p|1080p|720p|480p|360p)/i);
    if (qualityMatch) {
      const qualityStr = qualityMatch[0].toLowerCase();
      if (qualityStr.includes('4k') || qualityStr.includes('2160p')) {
        qualityKey = 2160;
      } else {
        qualityKey = parseInt(qualityStr.replace('p', ''), 10);
      }
    } else {
      // Default quality if not specified
      qualityKey = 720;
    }

    if (Number.isNaN(qualityKey) return acc;
    if (!acc[qualityKey] || qualityKey > parseInt(Object.keys(acc)[0], 10)) {
      acc[qualityKey] = stream.file;
    }
    return acc;
  }, {});

  // Sort streams by quality (highest first)
  const sortedQualities = Object.keys(streams)
    .map(Number)
    .sort((a, b) => b - a);

  // Prepare the output with available qualities
  const qualities: Record<string, { type: string; url: string }> = {};
  
  sortedQualities.forEach(quality => {
    qualities[quality] = {
      type: 'mp4', // Assuming MP4, adjust if needed
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
  disabled: false, // Don't disable based on token since it's optional
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidLinkScraper,
  scrapeShow: vidLinkScraper,
});