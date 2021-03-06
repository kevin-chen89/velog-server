import Router from '@koa/router';
import auth from './auth';
import files from './files';
import common from './common';

const v2 = new Router();

v2.get('/check', ctx => {
  ctx.body = {
    version: 'v2'
  };
});

v2.get('/test', async ctx => {
  ctx.body = {
    user_id: ctx.state.user_id
  };
});

v2.use('/auth', auth.routes());
v2.use('/files', files.routes());
v2.use('/common', common.routes());

export default v2;
