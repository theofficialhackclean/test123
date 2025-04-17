
const parseMediaFromUrl = (url: string) => {
  const regex = /tmdb-(movie|tv)-\d+-(.+)/;
  const match = url.match(regex);

  if (!match) {
    throw new Error('Invalid media URL format.');
  }

  return {
    type: match[1], // "movie" or "tv"
    title: match[2], // Extracted title slug
  };
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let mediaData;

  try {
    // Extract media type and title from URL
    mediaData = parseMediaFromUrl(window.location.href);
  } catch (error) {
    console.warn(error.message);
    throw new NotFoundError('Invalid or unsupported media URL.');
  }

  // Construct API URL dynamically
  const apiUrl = `${BASE_URL}/api/all?type=${mediaData.type}&title=${mediaData.title}`;
  const userToken = getUserToken();

  if (userToken) {
    console.log('Custom token found:', userToken);
  }

  const data = await ctx.fetcher<StreamData>(apiUrl, {
    headers: {
      ...(userToken && { 'ui-token': userToken }),
    },
  });

  if (data?.error === 'No results found in MovieBox search') {
    throw new NotFoundError('No stream found');
  }
  if (!data) throw new NotFoundError('No response from API');
  ctx.progress(50);

  const streams = Object.entries(data.streams).reduce((acc: Record<string, string>, [quality, url]) => {
    let qualityKey: number;
    if (quality === '4K') {
      qualityKey = 2160;
    } else if (quality === 'ORG') {
      return acc;
    } else {
      qualityKey = parseInt(quality.replace('P', ''), 10);
    }
    if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
    acc[qualityKey] = url;
    return acc;
  }, {});

  const captions: Caption[] = [];
  if (data.subtitles) {
    for (const [langKey, subtitleData] of Object.entries(data.subtitles)) {
      const languageKeyPart = langKey.split('_')[0];
      const languageName = languageKeyPart.charAt(0).toUpperCase() + languageKeyPart.slice(1);
      const languageCode = languageMap[languageName]?.toLowerCase() ?? 'unknown';

      if (subtitleData.subtitle_link) {
        const url = subtitleData.subtitle_link;
        const isVtt = url.toLowerCase().endsWith('.vtt');
        captions.push({
          type: isVtt ? 'vtt' : 'srt',
          id: url,
          url,
          language: languageCode,
          hasCorsRestrictions: false,
        });
      }
    }
  }

  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions,
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

export const FedAPIScraper = makeSourcerer({
  id: 'fedapi',
  name: 'FED API (4K)',
  rank: 260,
  disabled: !getUserToken(),
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
