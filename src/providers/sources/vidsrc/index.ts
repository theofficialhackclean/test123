import type { ShowMedia } from '@/entrypoint/utils/media';
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';
import { decode, mirza } from './decrypt';

const o = {
  y: 'xx??x?=xx?xx?=',
  u: '#1RyJzl3JYmljm0mkJWOGYWNyI6MfwVNGYXmj9uQj5tQkeYIWoxLCJXNkawOGF5QZ9sQj1YIWowLCJXO20VbVJ1OZ11QGiSlni0QG9uIn19',
};

async function vidsrcScrape(
  ctx: MovieScrapeContext | ShowScrapeContext
): Promise<SourcererOutput> {
  const imdbId = ctx.media.imdbId;
  if (!imdbId) throw new NotFoundError("IMDb ID not found");

  const isShow = ctx.media.type === "show";
  let season: number | undefined;
  let episode: number | undefined;

  if (isShow) {
    const show = ctx.media as ShowMedia;
    season = show.season?.number;
    episode = show.episode?.number;
    
    if (season === undefined || episode === undefined) {
      throw new NotFoundError("Season or episode number not found");
    }
  }

  const embedUrl = isShow
    ? `https://vidsrc-embed.ru/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`
    : `https://vidsrc-embed.ru/embed/${imdbId}`;

  ctx.progress(10);

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";

  const embedHtml = await ctx.proxiedFetcher<string>(embedUrl, {
    headers: {
      Referer: "https://vidsrc-embed.ru/",
      "User-Agent": UA,
    },
  });

  ctx.progress(30);

  // Find any iframe
  const iframeMatch = embedHtml.match(/<iframe[^>]*src="([^"]+)"/i);
  if (!iframeMatch) throw new NotFoundError("iframe not found");

  let rcpUrl = iframeMatch[1];
  if (rcpUrl.startsWith("//")) {
    rcpUrl = `https:${rcpUrl}`;
  } else if (!rcpUrl.startsWith("http")) {
    rcpUrl = `https://vidsrc-embed.ru${rcpUrl.startsWith('/') ? '' : '/'}${rcpUrl}`;
  }

  ctx.progress(50);

  const rcpHtml = await ctx.proxiedFetcher<string>(rcpUrl, {
    headers: { Referer: embedUrl, "User-Agent": UA },
  });

  // Extract script src - look for both inline and external scripts
  let prorcpUrl: string | null = null;
  
  // Try to find external script first
  const externalScriptMatch = rcpHtml.match(/<script[^>]+src="([^"]+)"/i);
  if (externalScriptMatch) {
    prorcpUrl = externalScriptMatch[1];
  } else {
    // Look for inline script with PlayerJS config
    const inlineScriptMatch = rcpHtml.match(/<script[^>]*>([\s\S]*?Playerjs[\s\S]*?)<\/script>/i);
    if (inlineScriptMatch) {
      // If we found inline script with PlayerJS, we can parse it directly
      const playerScript = inlineScriptMatch[1];
      const m3u8Match = playerScript.match(/file["']?\s*:\s*["']([^"']+)/) || 
                        playerScript.match(/sources\s*:\s*\[\s*\{[^}]*file["']?\s*:\s*["']([^"']+)/);
      
      if (m3u8Match) {
        let streamUrl = m3u8Match[1];
        
        // Decode if encrypted
        if (!streamUrl.includes(".m3u8")) {
          try {
            const v = JSON.parse(decode(o.u));
            streamUrl = mirza(streamUrl, v);
          } catch (_) {
            // Continue with original URL if decoding fails
          }
        }

        ctx.progress(90);

        const headers = {
          referer: "https://cloudnestra.com/",
          origin: "https://cloudnestra.com",
        };

        return {
          stream: [
            {
              id: "vidsrc-cloudnestra",
              type: "hls",
              playlist: createM3U8ProxyUrl(streamUrl, headers),
              captions: [],
              flags: [flags.CORS_ALLOWED],
            },
          ],
          embeds: [],
        };
      }
    }
  }

  if (!prorcpUrl) throw new NotFoundError("script not found");

  // Convert relative URLs to absolute
  if (prorcpUrl.startsWith("//")) {
    prorcpUrl = "https:" + prorcpUrl;
  } else if (prorcpUrl.startsWith("/")) {
    const origin = new URL(rcpUrl).origin;
    prorcpUrl = origin + prorcpUrl;
  }

  ctx.progress(70);

  const finalHtml = await ctx.proxiedFetcher<string>(prorcpUrl, {
    headers: { Referer: rcpUrl, "User-Agent": UA },
  });

  // Find PlayerJS config script
  const scripts = finalHtml.split("<script");
  const playerScript = scripts.find((s) => s.includes("Playerjs"));
  if (!playerScript) throw new NotFoundError("No PlayerJS config");

  // Extract file source with multiple pattern attempts
  let m3u8Match = playerScript.match(/file["']?\s*:\s*["']([^"']+)/);

  if (!m3u8Match) {
    m3u8Match = playerScript.match(
      /sources\s*:\s*\[\s*\{[^}]*file["']?\s*:\s*["']([^"']+)/
    );
  }

  // Try alternative patterns
  if (!m3u8Match) {
    m3u8Match = playerScript.match(/file\s*:\s*['"]([^'"]+)['"]/);
  }

  if (!m3u8Match) throw new NotFoundError("No playable stream found");

  let streamUrl = m3u8Match[1];

  // Decode if encrypted
  if (!streamUrl.includes(".m3u8")) {
    try {
      const v = JSON.parse(decode(o.u));
      streamUrl = mirza(streamUrl, v);
    } catch (_) {
      // Continue with original URL if decoding fails
    }
  }

  ctx.progress(90);

  const headers = {
    referer: "https://cloudnestra.com/",
    origin: "https://cloudnestra.com",
  };

  return {
    stream: [
      {
        id: "vidsrc-cloudnestra",
        type: "hls",
        playlist: createM3U8ProxyUrl(streamUrl, headers),
        captions: [],
        flags: [flags.CORS_ALLOWED],
      },
    ],
    embeds: [],
  };
}

export const vidsrcScraper = makeSourcerer({
  id: "cloudnestra",
  name: "Cloudnestra",
  rank: 180,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidsrcScrape,
  scrapeShow: vidsrcScrape,
});
