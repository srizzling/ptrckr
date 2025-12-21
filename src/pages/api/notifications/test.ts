import type { APIRoute } from 'astro';
import { sendTestNotification } from '../../../lib/notifications';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { channel, webhookUrl } = body;

    if (!channel || !webhookUrl) {
      return new Response(
        JSON.stringify({ message: 'Channel and webhook URL are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const success = await sendTestNotification(channel, webhookUrl);

    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(
        JSON.stringify({ message: 'Failed to send test notification' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to send test notification' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
