import type { APIRoute } from 'astro';
import {
  getNotificationConfigById,
  updateNotificationConfig,
  deleteNotificationConfig
} from '../../../lib/db/queries/notifications';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid notification ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const config = await getNotificationConfigById(id);
    if (!config) {
      return new Response(JSON.stringify({ message: 'Notification not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch notification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid notification ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const config = await updateNotificationConfig(id, body);

    if (!config) {
      return new Response(JSON.stringify({ message: 'Notification not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    return new Response(JSON.stringify({ message: 'Failed to update notification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid notification ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deleteNotificationConfig(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return new Response(JSON.stringify({ message: 'Failed to delete notification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
