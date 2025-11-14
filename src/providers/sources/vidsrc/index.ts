import type { ShowMedia } from '@/entrypoint/utils/media';
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

async function vidsrcScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const imdbId = ctx.media.imdbId;
  if (!imdbId) throw new NotFoundError('IMDb ID not found');

  const isShow = ctx.media.type === 'show';
  let season: number | undefined;
  let episode: number | undefined;

  if (isShow) {
    const show = ctx.media as ShowMedia;
    season = show.season?.number;
    episode = show.episode?.number;
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
  
  const embedUrl = isShow
    ? `https://vidsrc-embed.ru/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`
    : `https://vidsrc-embed.ru/embed/${imdbId}`;

  ctx.progress(10);

  let embedHtml: string;
  try {
    embedHtml = await ctx.proxiedFetcher<string>(embedUrl, {
      headers: {
        Referer: 'https://vidsrc-embed.ru/',
        'User-Agent': userAgent,
      },
    });
  } catch (error) {
    throw new NotFoundError(`Failed to fetch embed page: ${(error as Error).message}`);
  }

  ctx.progress(30);

  // Look for iframe in multiple ways
  let iframeSrc: string | null = null;

  // Method 1: Look for player_iframe
  let iframeMatch = embedHtml.match(/<iframe[^>]*id="player_iframe"[^>]*src="([^"]*)"[^>]*>/);
  if (iframeMatch) {
    iframeSrc = iframeMatch[1];
  }

  // Method 2: Look for any iframe with common player classes/ids
  if (!iframeSrc) {
    iframeMatch = embedHtml.match(/<iframe[^>]*src="([^"]*)"[^>]*(?:id|class)="[^"]*(?:player|embed|video)[^"]*"[^>]*>/i);
    if (iframeMatch) {
      iframeSrc = iframeMatch[1];
    }
  }

  // Method 3: Look for any iframe
  if (!iframeSrc) {
    iframeMatch = embedHtml.match(/<iframe[^>]*src="([^"]*)"[^>]*>/i);
    if (iframeMatch) {
      iframeSrc = iframeMatch[1];
    }
  }

  if (!iframeSrc) {
    throw new NotFoundError('No iframe found in embed page');
  }

  // Ensure iframe URL is absolute
  const rcpUrl = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : 
                 iframeSrc.startsWith('/') ? `https://vidsrc-embed.ru${iframeSrc}` : 
                 iframeSrc;

  ctx.progress(50);

  try {
    const rcpHtml = await ctx.proxiedFetcher<string>(rcpUrl, {
      headers: { 
        Referer: 'https://vidsrc-embed.ru/',
        'User-Agent': userAgent 
      },
    });

    ctx.progress(60);

    // Extract the prorcp script URL - look for the encoded prorcp path
    let prorcpPath: string | null = null;
    
    // Method 1: Look for prorcp in script tags
    const prorcpMatch = rcpHtml.match(/src\s*:\s*["'](\/prorcp\/[^"']+)["']/);
    if (prorcpMatch) {
      prorcpPath = prorcpMatch[1];
    }

    // Method 2: Look for prorcp in any script src
    if (!prorcpPath) {
      const scriptMatch = rcpHtml.match(/<script[^>]*src=["'](\/prorcp\/[^"']+)["'][^>]*>/i);
      if (scriptMatch) {
        prorcpPath = scriptMatch[1];
      }
    }

    // Method 3: Look for any prorcp URL
    if (!prorcpPath) {
      const anyProrcpMatch = rcpHtml.match(/(\/prorcp\/[a-zA-Z0-9+/=-]+)/);
      if (anyProrcpMatch) {
        prorcpPath = anyProrcpMatch[1];
      }
    }

    if (!prorcpPath) {
      throw new NotFoundError('No prorcp path found');
    }

    const prorcpUrl = `https://vidsrc-embed.ru${prorcpPath}`;

    ctx.progress(70);

    // Fetch the prorcp JavaScript file
    const prorcpScript = await ctx.proxiedFetcher<string>(prorcpUrl, {
      headers: { 
        Referer: rcpUrl,
        'User-Agent': userAgent 
      },
    });

    ctx.progress(80);

    // Extract stream URL from the prorcp script
    let streamUrl: string | null = null;

    // Method 1: Look for direct m3u8 URL in the script
    const m3u8Match = prorcpScript.match(/(https?:\/\/[^"']*\.m3u8[^"']*)/i);
    if (m3u8Match) {
      streamUrl = m3u8Match[1];
    }

    // Method 2: Look for Playerjs configuration
    if (!streamUrl) {
      const playerjsMatch = prorcpScript.match(/file\s*:\s*["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/i);
      if (playerjsMatch) {
        streamUrl = playerjsMatch[1];
      }
    }

    // Method 3: Look for base64 encoded URLs
    if (!streamUrl) {
      const base64Match = prorcpScript.match(/(?:file|src|url)\s*:\s*["'](?:data:application\/json;base64,|)([a-zA-Z0-9+/=]+)["']/i);
      if (base64Match) {
        try {
          const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
          const urlMatch = decoded.match(/(https?:\/\/[^"']*\.m3u8[^"']*)/i);
          if (urlMatch) {
            streamUrl = urlMatch[1];
          }
        } catch (e) {
          // Continue if base64 decoding fails
        }
      }
    }

    // Method 4: Look for encoded URLs that need processing
    if (!streamUrl) {
      // Try to find any URL-like patterns that might be encoded
      const encodedUrlMatch = prorcpScript.match(/(?:file|src|url)\s*:\s*["']([^"']+)["']/i);
      if (encodedUrlMatch) {
        const potentialUrl = encodedUrlMatch[1];
        // If it doesn't look like a normal URL, try base64 decoding
        if (!potentialUrl.startsWith('http') && potentialUrl.length > 10) {
          try {
            const decoded = Buffer.from(potentialUrl, 'base64').toString('utf-8');
            if (decoded.includes('.m3u8')) {
              streamUrl = decoded;
            }
          } catch (e) {
            // Not base64 encoded, continue
          }
        }
      }
    }

    if (!streamUrl) {
      // Last resort: try to find any m3u8 mention in the entire script
      const anyM3u8Match = prorcpScript.match(/([a-zA-Z0-9+/=]{100,})/);
      if (anyM3u8Match) {
        const longString = anyM3u8Match[1];
        try {
          const decoded = Buffer.from(longString, 'base64').toString('utf-8');
          if (decoded.includes('.m3u8')) {
            const urlMatch = decoded.match(/(https?:\/\/[^"']*\.m3u8[^"']*)/i);
            if (urlMatch) {
              streamUrl = urlMatch[1];
            }
          }
        } catch (e) {
          // Continue if decoding fails
        }
      }
    }

    if (!streamUrl) {
      throw new NotFoundError('No m3u8 stream URL found in prorcp script');
    }

    ctx.progress(90);

    const headers = {
      referer: 'https://vidsrc-embed.ru/',
      origin: 'https://vidsrc-embed.ru',
    };

    return {
      stream: [
        {
          id: 'vidsrc',
          type: 'hls',
          playlist: createM3U8ProxyUrl(streamUrl, headers),
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
      embeds: [],
    };

  } catch (error) {
    // If everything fails, try to extract directly from embed page as fallback
    const directMatch = embedHtml.match(/(https?:\/\/[^"']*\.m3u8[^"']*)/i);
    if (directMatch) {
      ctx.progress(90);
      
      const headers = {
        referer: 'https://vidsrc-embed.ru/',
        origin: 'https://vidsrc-embed.ru',
      };

      return {
        stream: [
          {
            id: 'vidsrc-direct',
            type: 'hls',
            playlist: createM3U8ProxyUrl(directMatch[1], headers),
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
        embeds: [],
      };
    }

    throw new NotFoundError(`Failed to extract stream: ${(error as Error).message}`);
  }
}

export const vidsrcScraper = makeSourcerer({
  id: 'vidsrc',
  name: 'VidSrc',
  rank: 180,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidsrcScrape,
  scrapeShow: vidsrcScrape,
});
