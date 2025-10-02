import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://autoembed.pro/';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const playerPage = await ctx.proxiedFetcher(`/embed/`, {
    baseUrl,
    query: {
      id: ctx.media.tmdbId,
      ...(ctx.media.type === 'show' && {
        s: ctx.media.season.number.toString(),
        e: ctx.media.episode.number.toString(),
      }),
    },
  });

  const fileDataMatch = playerPage.match(/"file":\s*(\[.*?\])/s);
  if (!fileDataMatch) throw new NotFoundError('No file data match found');

  let fileData: { title: string; file: string }[];
  try {
    fileData = JSON.parse(
      fileDataMatch[1].replace(/,\s*\]$/, ']') // remove trailing commas
    );
  } catch (err) {
    throw new NotFoundError('Failed to parse file data JSON');
  }

  const embeds: SourcererEmbed[] = [];

  for (const stream of fileData) {
    const url = stream.file?.trim();
    if (!url) continue;
    embeds.push({
      embedId: `autoembed-${stream.title.toLowerCase().replace(/\s+/g, '-')}`,
      url,
    });
  }

  if (!embeds.length) throw new NotFoundError('No valid embeds found');

  return { embeds };
}

export const autoembedScraper = makeSourcerer({
  id: 'autoembed',
  name: 'Autoembed',
  rank: 90,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
