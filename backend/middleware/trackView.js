import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to track page views.
 * It ensures each visitor has a UUID stored in a cookie (zoroflix_uuid).
 * For authenticated users, it also records the user ID.
 * Inserts a record into the `page_views` table for content pages only.
 * 
 * NOTE: Live session tracking (online users) is now handled by the
 * active heartbeat system in the frontend (POST /api/admin/heartbeat).
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

      const userId = req.user?.id || null;
      const contentId = req.params?.contentId || null;
      const page = req.path;

      // Apenas registrar visualizações de páginas válidas do front-end (Ignora API e Arquivos)
      if (!page.startsWith('/api') && !page.startsWith('/uploads') && !page.includes('.')) {
        await db.run(
          `INSERT INTO page_views (uuid, user_id, content_id, page) VALUES (?, ?, ?, ?)`,
          [visitorUuid, userId, contentId, page]
        );
      }
    } catch (err) {
      console.error('trackView middleware error:', err);
    }
    next();
  };
}
