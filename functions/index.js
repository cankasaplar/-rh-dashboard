/**
 * BRAIN_LAYER: CASTLE GENESIS
 * Central causal authority for world reality.
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const APP_ID = 'castle-8cb15';
const REGION = 'europe-west3';

admin.initializeApp({
  databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${APP_ID}-default-rtdb.firebaseio.com`,
});

const db = admin.firestore();
const rtdb = admin.database();

/**
 * RESOLVE_CAUSAL_ACTION
 * Validates authenticated user intent and applies server-authoritative writes.
 */
exports.resolveCausalAction = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Guardian signature is invalid.');
    }

    const { intent = '', cellId = 'c_410_290', payload = {} } = data || {};
    const uid = context.auth.uid;
    const ts = admin.firestore.FieldValue.serverTimestamp();
    const cleanIntent = String(intent).trim().toLowerCase();

    if (!cleanIntent) {
      throw new functions.https.HttpsError('invalid-argument', 'Intent is required.');
    }

    console.log(`[CAUSAL] Intent: ${cleanIntent} | Cell: ${cellId} | Guardian: ${uid}`);

    try {
      if (cleanIntent.includes('boost')) {
        const nodeId = payload.nodeId || 'portal_main';
        const nodeRef = db
          .collection('artifacts')
          .doc(APP_ID)
          .collection('cells')
          .doc(cellId)
          .collection('nodes')
          .doc(nodeId);

        await nodeRef.set({
          pos: payload.pos || { lat: 41.0122, lng: 28.9784 },
          resonance: 1.0,
          type: payload.type || 'CCTV',
          updatedAt: ts,
          updatedBy: uid,
          lifecycle: 'ACTIVE',
        }, { merge: true });

        return { status: 'Causality stabilized. Portal resonance is 100%.' };
      }

      if (cleanIntent.includes('spike')) {
        const eventRef = db
          .collection('artifacts')
          .doc(APP_ID)
          .collection('public')
          .doc('events')
          .collection('items')
          .doc('global_spike');

        await eventRef.set({
          active: true,
          ts,
          triggeredBy: uid,
          intensity: 1.0,
          codex_anchor: '2025-07-12',
        });

        return { status: 'Global resonance spike triggered.' };
      }

      if (cleanIntent.includes('spawn')) {
        const newNodeRef = db
          .collection('artifacts')
          .doc(APP_ID)
          .collection('cells')
          .doc(cellId)
          .collection('nodes')
          .doc();

        await newNodeRef.set({
          type: payload.type || 'GHOST',
          pos: payload.pos || { lat: 41.045, lng: 29.006 },
          resonance: 0.6,
          lifecycle: 'ACTIVE',
          owner: uid,
          updatedAt: ts,
        });

        return { status: 'Entity materialized successfully.' };
      }

      return { status: 'Intent received, but no causal match was found.' };
    } catch (error) {
      console.error('[CRITICAL_FAILURE]', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * SCHEDULED: Presence Cleanup
 * Removes inactive sessions every five minutes.
 */
exports.scheduledPresenceCleanup = functions
  .region(REGION)
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const cutoff = Date.now() - (5 * 60 * 1000);
    const presenceRef = rtdb.ref(`presence/${APP_ID}/users`);
    const snapshot = await presenceRef.once('value');
    const updates = {};

    snapshot.forEach((child) => {
      if (child.val().lastSeen < cutoff) {
        updates[child.key] = null;
      }
    });

    if (Object.keys(updates).length > 0) {
      await presenceRef.update(updates);
      console.log(`[CLEANUP] Removed ${Object.keys(updates).length} inactive sessions.`);
    }

    return null;
  });
