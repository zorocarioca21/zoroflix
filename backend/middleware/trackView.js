import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to track page views.
 * It ensures each visitor has a UUID stored in a cookie (zoroflix_uuid).
 * For authenticated users, it also records the user ID.
 * Inserts a record into the `page_views` table for every request that passes through.
 */
export default function trackView(db) {
  return async (req, res, next) => {
    try {
      // Ensure UUID cookie exists
      let visitorUuid = req.cookies?.zoroflix_uuid;
      if (!visitorUuid) {
        visitorUuid = uuidv4();
        res.cookie('zoroflix_uuid', visitorUuid, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
      }

      // Ensure session cookie exists for live tracking
      let sessionId = req.cookies?.zoroflix_session;
      if (!sessionId) {
        sessionId = uuidv4();
        res.cookie('zoroflix_session', sessionId, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
      }

      const userId = req.user?.id || null; // Assuming auth middleware populates req.user
      const contentId = req.params?.contentId || null; // May be set by route handlers
      const page = req.path; // Simple identifier of the page

      // Record page view only for content pages
      if (contentId || page.startsWith('/filme') || page.startsWith('/serie')) {
        await db.run(
          `INSERT INTO page_views (uuid, user_id, content_id, page) VALUES (?, ?, ?, ?)`,
          [visitorUuid, userId, contentId, page]
        );
      }

      // Upsert live session on every request (identifica usuário único)
      await db.run(
        `INSERT INTO live_sessions (session_id, uuid, user_id, last_heartbeat)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(session_id) DO UPDATE SET last_heartbeat = datetime('now')`,
        [sessionId, visitorUuid, userId]
      );
    } catch (err) {
      console.error('trackView middleware error:', err);
    }
    next();
  };
}
