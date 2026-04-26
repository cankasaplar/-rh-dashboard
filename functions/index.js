const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const CODEX_DATE = process.env.CODEX_DATE || '2025-07-12';
const REGION = 'europe-west3';

exports.castleGenesisStatus = onRequest({ region: REGION }, (request, response) => {
  logger.info('Castle Genesis status check', { codeDate: CODEX_DATE, region: REGION });
  response.json({
    ok: true,
    service: 'castle-genesis',
    codexDate: CODEX_DATE,
    region: REGION,
  });
});
