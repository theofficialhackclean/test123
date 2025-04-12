import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://api.coitus.ca';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const apiUrl =
    ctx.media.type === 'movie'
      ? `${baseUrl}/movie/${ctx.media.tmdbId}`
      : `${baseUrl}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  const apiRes = await ctx.proxiedFetcher(apiUrl);

  if (!apiRes.videoSource) throw new NotFoundError('No watchable item found');

  let processedUrl = apiRes.videoSource;
  if (processedUrl.includes('orbitproxy')) {
    try {
      const urlParts = processedUrl.split(/orbitproxy\.[^/]+\//);
      if (urlParts.length >= 2) {
        const encryptedPart = urlParts[1].split('.m3u8')[0];

        try {
          const decodedData = Buffer.from(encryptedPart, 'base64').toString('utf-8');

          const jsonData = JSON.parse(decodedData);

          const originalUrl = jsonData.u;
          const referer = jsonData.r || '';

          const encodedUrl = encodeURIComponent(originalUrl);
          const encodedHeaders = encodeURIComponent(
            JSON.stringify({
              referer,
            }),
          );

          processedUrl = `https://proxy.fifthwit.net/m3u8-proxy?url=${encodedUrl}&headers=${encodedHeaders}`;
        } catch (jsonError) {
          console.error('Error decoding/parsing orbitproxy data:', jsonError);
        }
      }
    } catch (error) {
      console.error('Error processing orbitproxy URL:', error);
    }
  }

  // eslint-disable-next-line no-console
  console.log(apiRes);
  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions: [],
        playlist: processedUrl,
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const coitusScraper = makeSourcerer({
  id: 'coitus',
  name: 'Autoembed+',
  rank: 91,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
