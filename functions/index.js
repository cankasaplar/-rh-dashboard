const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west3', maxInstances: 10 });

const CODEX_VERSION = 'v149.2-PATH-SANITY';
const CODEX_DATE = '2025-07-12';

const sanitizeAppId = (value = 'castle-genesis') => String(value).replace(/[.#$[\]]/g, '_');

exports.resolveCausalAction = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Castle Genesis command requires authentication.');
  }

  const command = String(request.data?.command || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const cellId = String(request.data?.cellId || 'c_alpha_sim').replace(/[.#$[\]/]/g, '_');
  const version = String(request.data?.version || CODEX_VERSION);
  const timestamp = String(request.data?.timestamp || CODEX_DATE);

  if (!command) {
    throw new HttpsError('invalid-argument', 'Command is empty after sanitization.');
  }

  const appId = sanitizeAppId(process.env.CASTLE_GENESIS_APP_ID);
  const docRef = admin.firestore()
    .collection('artifacts')
    .doc(appId)
    .collection('private')
    .doc(request.auth.uid)
    .collection('commands')
    .doc();

  await docRef.set({
    command,
    cellId,
    version,
    timestamp,
    uid: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    accepted: true,
    command,
    cellId,
    version,
    timestamp,
  };
});
