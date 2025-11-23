import type { Request, Response } from 'express-serve-static-core';
import type { Analysis, Item } from '@ghs/types';
import { getQueryData, setDefaultHeader } from '../utils/ServerUtil';
import {
  cancelCollect,
  clearCurrentUrl,
  deleteSearch,
  getAnalysisDetail,
  getAnalysisVideoDetail,
  getCurrentWebConfig,
  getDetailPage,
  getHtml,
  getImage,
  getPage,
  getSeriesCurrentContent,
  isCollect,
  listAllWebConfigs,
  listCollect,
  listHistory,
  loadPage,
  saveCollect,
  search,
  searchRecommend,
  setCurrentKeyExp,
} from '../../export';
import { cache_suffix_clean } from '../../utils';
export default async (route: string, req: Request, res: Response) => {
  setDefaultHeader(res);
  switch (route) {
    case '/getPage': {
      const queryData = getQueryData<{ webKey: string }>(req);
      const resData = await getPage(queryData.webKey);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/loadPage': {
      const queryData = getQueryData<{ url: string }>(req);
      const resData = await loadPage(queryData.url);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getImage': {
      const queryData = getQueryData<{ url: string }>(req);
      const resData = await getImage(queryData.url);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/listAllWebConfigs': {
      const resData = await listAllWebConfigs();
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getDetailPage': {
      const queryData = getQueryData<{ item: Item }>(req);
      const resData = await getDetailPage(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getCurrentWebConfig': {
      const queryData = getQueryData<{ webKey: string }>(req);
      const resData = await getCurrentWebConfig(queryData.webKey);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/search': {
      const queryData = getQueryData<{ search: string; item: Item }>(req);
      const resData = await search(queryData.search, queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/isCollect': {
      const queryData = getQueryData<{ item: Item }>(req);
      const resData = await isCollect(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/saveCollect': {
      const queryData = getQueryData<{ item: Item }>(req);
      const resData = await saveCollect(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/cancelCollect': {
      const queryData = getQueryData<{ item: Item }>(req);
      const resData = await cancelCollect(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/listCollect': {
      const queryData = getQueryData<{ webKey: string }>(req);
      const resData = await listCollect(queryData.webKey);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getHtml': {
      const queryData = getQueryData<{ url: string }>(req);
      const resData = await getHtml(queryData.url);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/searchRecommend': {
      const queryData = getQueryData<{ search: string }>(req);
      const resData = await searchRecommend(queryData.search);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/deleteSearch': {
      const queryData = getQueryData<{ searchValue: string }>(req);
      const resData = await deleteSearch(queryData.searchValue);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/cacheSuffixClean': {
      const queryData = getQueryData<{ fileSuffix?: string }>(req);
      cache_suffix_clean(queryData.fileSuffix);
      res.end(JSON.stringify(''));
      break;
    }
    case '/listHistory': {
      const resData = await listHistory();
      res.end(JSON.stringify(resData));
      break;
    }
    case '/clearCurrentUrl': {
      const resData = await clearCurrentUrl();
      res.end(JSON.stringify(resData));
      break;
    }
    case '/setCurrentKeyExp': {
      const queryData = getQueryData<{ key?: string }>(req);
      const resData = await setCurrentKeyExp(queryData.key);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getAnalysisDetail': {
      const queryData = getQueryData<{ item: Analysis }>(req);
      const resData = await getAnalysisDetail(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getAnalysisVideoDetail': {
      const queryData = getQueryData<{ item: Analysis }>(req);
      const resData = await getAnalysisVideoDetail(queryData.item);
      res.end(JSON.stringify(resData));
      break;
    }
    case '/getSeriesCurrentContent': {
      const resData = await getSeriesCurrentContent();
      res.end(JSON.stringify(resData));
      break;
    }
  }
};
