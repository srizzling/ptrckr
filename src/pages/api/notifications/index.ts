import type { APIRoute } from 'astro';
import { createNotificationConfig } from '../../../lib/db/queries/notifications';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { channel, webhookUrl, productId, triggerType, thresholdValue } = body;

    if (!channel || !webhookUrl || !triggerType) {
      return new Response(
        JSON.stringify({ message: 'Channel, webhook URL, and trigger type are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const config = await createNotificationConfig({
      channel,
      webhookUrl,
      productId: productId ? Number(productId) : null,
      triggerType,
      thresholdValue: thresholdValue ? Number(thresholdValue) : null,
      enabled: true
    });

    return new Response(JSON.stringify(config), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating notification config:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to create notification config' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
