 import { makeSourcerer } from '@/providers/base';
 import { scrapeMovie } from '@/providers/sources/vidsrc/scrape-movie';
 import { scrapeShow } from '@/providers/sources/vidsrc/scrape-show';

 export const vidsrcScraper = makeSourcerer({
   id: 'vidsrc',
   name: 'VidSrc',
   rank: 290,
   disabled: true,
   flags: [],
   scrapeMovie,
   scrapeShow,
 });
