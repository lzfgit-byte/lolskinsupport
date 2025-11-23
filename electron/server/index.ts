import express from 'express';
import { SERVER_PORT } from '@ghs/constant';
import { LogMsgUtil } from '../utils/message';
import useDispatchController from './hook/useDispatchController';
import useFileDispatch from './hook/useFileDispatch';
import useVideoProxy from './hook/useVideoProxy';

const getRouter = [
  'getImage',
  'getImageByte',
  'getPage',
  'loadPage',
  'listAllWebConfigs',
  'getDetailPage',
  'getCurrentWebConfig',
  'search',
  'isCollect',
  'saveCollect',
  'cancelCollect',
  'listCollect',
  'getHtml',
  'searchRecommend',
  'deleteSearch',
  'cacheSuffixClean',
  'listHistory',
  'clearCurrentUrl',
  'setCurrentKeyExp',
  'getAnalysisDetail',
  'getAnalysisVideoDetail',
  'getSeriesCurrentContent',
];

export const useServer = () => {
  let app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Authorization,X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method'
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, PUT, DELETE');
    res.header('Allow', 'GET, POST, PATCH, OPTIONS, PUT, DELETE');
    next();
  });
  app.get('/videoProxy', async (req, res) => {
    await useVideoProxy('/videoProxy', req, res);
  });
  getRouter.forEach((item) => {
    app.get(`/${item}`, async (req, res) => {
      await useDispatchController(`/${item}`, req, res);
    });
  });

  app.get('/index', async (req, res) => {
    await useFileDispatch('/index', req, res);
  });
  app.all('*', async (req, res) => {
    await useFileDispatch('*', req, res);
  });

  app.listen(SERVER_PORT, () => {
    LogMsgUtil.sendLogMsg('server started');
  });
};
