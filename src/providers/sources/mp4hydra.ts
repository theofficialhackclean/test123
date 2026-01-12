import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://mp4hydra.org/';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const searchPage = await ctx.proxiedFetcher('/search', {
    baseUrl,
    query: {
      q: ctx.media.title,
    },
  });

  ctx.progress(40);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number | undefined; url: string }[] = [];

  $search('.search-details').each((_, element) => {
    const fullText = $search(element).find('a').first().text().trim();
    const url = $search(element).find('a').attr('href');

    if (!fullText || !url) return;

    // Extract the movie ID from the URL (e.g., /movie/12345/title-name)
    const urlParts = url.split('/').filter(x => x);
    const movieId = urlParts.length >= 2 ? urlParts[1] : null;
    
    if (!movieId) return;

    // Improved regex to handle various formats: "Title (Year)", "Title Year", "Title (Year-Year)", etc.
    const yearMatch = fullText.match(/\((\d{4})(?:\s*-\s*\d{0,4})?\)/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    
    // Remove year information to get clean title
    const title = fullText.replace(/\s*\(?\s*\d{4}(?:\s*-\s*\d{0,4})?\s*\)?\s*$/, '').trim();

    if (!title) return;

    searchResults.push({ title, year, url: movieId });
  });

  const s = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))?.url;
  if (!s) throw new NotFoundError('No watchable item found');

  ctx.progress(60);

  const data: { playlist: { src: string; label: string }[]; servers: { [key: string]: string; auto: string } } =
    await ctx.proxiedFetcher('/info2?v=8', {
      method: 'POST',
      body: new URLSearchParams({ z: JSON.stringify([{ s, t: 'movie' }]) }),
      baseUrl,
    });
  if (!data.playlist || !data.playlist[0] || !data.playlist[0].src || !data.servers) {
    throw new NotFoundError('No watchable item found');
  }

  ctx.progress(80);

  const embeds: SourcererEmbed[] = [];
  // rank the server as suggested by the api
  [
    data.servers[data.servers.auto],
    ...Object.values(data.servers).filter((x) => x !== data.servers[data.servers.auto] && x !== data.servers.auto),
  ].forEach((server, _) =>
    embeds.push({ embedId: `mp4hydra-${_ + 1}`, url: `${server}${data.playlist[0].src}|${data.playlist[0].label}` }),
  );

  ctx.progress(90);

  return {
    embeds,
  };
}

export const mp4hydraScraper = makeSourcerer({
  id: 'mp4hydra',
  name: 'Mp4Hydra',
  rank: 3,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});